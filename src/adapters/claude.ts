import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execAbortable } from "../exec.js";
import {
  withDefaults,
  runCommand,
  checkInstalled,
  extractVersion,
  EXEC_DEFAULTS,
} from "../adapter-base.js";
import {
  readJsonl,
  asRecord,
  flattenText,
  summariseTool,
  editFromToolInput,
  roleFor,
  buildTranscript,
} from "../transcript.js";
import type {
  RawExecutionOutput,
  RuntimeAdapter,
  RuntimeExecutionRequest,
  RuntimeHealth,
  Transcript,
  TranscriptBlock,
  TranscriptMessage,
  TranscriptRole,
} from "../types.js";

export function createClaudeRuntime(): RuntimeAdapter {
  return withDefaults({
    type: "cli",
    name: "claude",
    models: ["opus", "sonnet", "haiku"] as const,
    defaultModel: "sonnet",
    supportsCustomPrompt: true,
    capabilities: {
      command: "claude",
      promptStrategy: "file-ref",
      requiresPty: false,
      supportsModelSelection: true,
      authMethods: [
        { type: "auth-command", command: ["claude", "auth", "status"] },
        { type: "env", keys: ["ANTHROPIC_API_KEY"] },
      ],
      relevantEnvVars: ["ANTHROPIC_API_KEY"],
      supportsSessionCapture: true,
    },

    async execute(request: RuntimeExecutionRequest): Promise<RawExecutionOutput> {
      const cmd = request.overrides?.command ?? "claude";

      // claude insists on its own session store, so the id is pinned here and
      // the file fetched from there afterwards. Pinning beats matching on
      // timestamps, which goes wrong the moment two runs overlap in one repo.
      const sessionId = request.sessionFile ? crypto.randomUUID() : undefined;

      const args = [
        "--model",
        resolveModel(request.model),
        "--dangerously-skip-permissions",
        "--output-format",
        "text",
        ...(sessionId ? ["--session-id", sessionId] : []),
        "-p",
        `Read and follow the instructions in this file: ${request.promptFile}`,
        ...(request.overrides?.extraArgs ?? []),
      ];

      const result = await runCommand(request, cmd, args);
      if (!request.sessionFile || !sessionId) return result;

      const written = collectSession(sessionId, request.sessionFile);
      return written ? { ...result, sessionFile: request.sessionFile } : result;
    },

    readTranscript(sessionFile: string): Transcript | null {
      return parseClaudeSession(sessionFile);
    },

    async healthCheck(): Promise<RuntimeHealth> {
      const name = "claude";
      const check = await checkInstalled(name, "claude");
      if (!check.installed) return check.health;

      let authenticated: "yes" | "no" | "unknown" = "unknown";
      let authDetail = "";
      try {
        const authResult = await execAbortable("claude", ["auth", "status"], {
          timeout: EXEC_DEFAULTS.healthTimeout,
        });
        const output = authResult.stdout + authResult.stderr;
        if (/logged.?in|loggedIn|authenticated|active|"loggedIn":\s*true/i.test(output)) {
          authenticated = "yes";
          authDetail = "claude auth status: authenticated";
        } else {
          authenticated = "no";
          authDetail = "claude auth status: not authenticated";
        }
      } catch {
        if (process.env.ANTHROPIC_API_KEY) {
          authenticated = "yes";
          authDetail = "env: ANTHROPIC_API_KEY";
        } else {
          authenticated = "unknown";
          authDetail = "could not determine (no env var, auth command failed)";
        }
      }

      return {
        name,
        command: "claude",
        installed: true,
        version: extractVersion(check.version ?? ""),
        authenticated,
        authDetail,
        error: null,
      };
    },
  });
}

function resolveModel(model: string): string {
  const map: Record<string, string> = {
    opus: "claude-opus-4-6",
    sonnet: "claude-sonnet-4-6",
    haiku: "claude-haiku-4-5-20251001",
  };
  return map[model] ?? model;
}

export const createAdapter = createClaudeRuntime;

/** `/Users/me/work` → `-Users-me-work`, which is how claude names its project dirs. */
export function encodeProjectDir(cwd: string): string {
  return cwd.replace(/\//g, "-");
}

/**
 * Move the session claude wrote into its own store over to where the caller
 * asked for it. The project directory is derived from the working directory the
 * run happened in, which is the same thing claude keys on.
 */
function collectSession(sessionId: string, destination: string): boolean {
  const source = path.join(
    os.homedir(),
    ".claude",
    "projects",
    encodeProjectDir(process.cwd()),
    `${sessionId}.jsonl`,
  );

  try {
    if (!fs.existsSync(source)) return false;
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
    return true;
  } catch {
    return false;
  }
}

/** Entries that are bookkeeping rather than conversation. */
const SKIP = new Set(["attachment", "queue-operation", "last-prompt", "summary"]);

export function parseClaudeSession(sessionFile: string): Transcript | null {
  const events = readJsonl(sessionFile);
  if (events.length === 0) return null;

  const messages: TranscriptMessage[] = [];
  let model: string | undefined;

  for (const event of events) {
    if (SKIP.has(String(event.type ?? ""))) continue;

    const message = asRecord(event.message);
    if (!message) continue;
    if (typeof message.model === "string") model = message.model;

    const blocks = toBlocks(message.content, asRecord(event.toolUseResult));
    if (blocks.length === 0) continue;

    const type = String(event.type ?? "");
    const base: TranscriptRole =
      type === "user" ? "user" : type === "assistant" ? "assistant" : "system";

    messages.push({
      id: String(event.uuid ?? messages.length),
      role: roleFor(base, blocks),
      ...(typeof event.timestamp === "string" ? { at: event.timestamp } : {}),
      blocks,
    });
  }

  return buildTranscript("claude", messages, model);
}

function toBlocks(
  content: unknown,
  toolUseResult: Record<string, unknown> | null,
): TranscriptBlock[] {
  if (typeof content === "string") {
    return content.trim() ? [{ kind: "text", text: content }] : [];
  }
  if (!Array.isArray(content)) return [];

  const blocks: TranscriptBlock[] = [];
  for (const raw of content) {
    const block = asRecord(raw);
    if (!block) continue;

    switch (block.type) {
      case "text": {
        const text = String(block.text ?? "");
        if (text.trim()) blocks.push({ kind: "text", text });
        break;
      }
      case "thinking": {
        const text = String(block.thinking ?? "");
        if (text.trim()) blocks.push({ kind: "thinking", text });
        break;
      }
      case "tool_use": {
        const name = String(block.name ?? "tool");
        const input = asRecord(block.input) ?? {};
        blocks.push({
          kind: "tool_use",
          ...(typeof block.id === "string" ? { id: block.id } : {}),
          name,
          input,
          summary: summariseTool(input),
        });
        const edit = editFromToolInput(name, input);
        if (edit) blocks.push(edit);
        break;
      }
      case "tool_result": {
        blocks.push({
          kind: "tool_result",
          ...(typeof block.tool_use_id === "string" ? { toolUseId: block.tool_use_id } : {}),
          ok: block.is_error !== true,
          text: flattenText(block.content) || flattenText(toolUseResult),
        });
        break;
      }
    }
  }
  return blocks;
}
