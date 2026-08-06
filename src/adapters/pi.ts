import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { withDefaults, executeViaStdin, checkInstalled } from "../adapter-base.js";
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
  RuntimeAdapter,
  RuntimeHealth,
  Transcript,
  TranscriptBlock,
  TranscriptMessage,
  TranscriptRole,
} from "../types.js";

const PI_MODELS = [
  "anthropic/claude-sonnet-4-6",
  "anthropic/claude-opus-4-6",
  "anthropic/claude-haiku-4-5-20251001",
  "google/gemini-2.5-pro",
  "google/gemini-2.5-flash",
  "openai/gpt-5",
  "openai/gpt-5-mini",
] as const;

const PI_MODELS_STORE = `${os.homedir()}/.pi/agent/models-store.json`;

/**
 * Discover pi's live model catalog from its local models store, unioned with
 * the static seed. The store groups models by provider; each provider holds a
 * `models` array of `{ id }` entries. Falls back to the seed when the store is
 * missing or unparseable.
 */
export function discoverPiModels(): string[] {
  try {
    const store = JSON.parse(fs.readFileSync(PI_MODELS_STORE, "utf-8")) as Record<
      string,
      { models?: Array<{ id?: string }> }
    >;
    const discovered: string[] = [];
    for (const provider of Object.values(store)) {
      for (const model of provider?.models ?? []) {
        if (typeof model?.id === "string" && model.id) discovered.push(model.id);
      }
    }
    return [...new Set([...PI_MODELS, ...discovered])];
  } catch {
    return [...PI_MODELS];
  }
}

export function createPiRuntime(): RuntimeAdapter {
  return withDefaults({
    type: "cli",
    name: "pi",
    models: PI_MODELS,
    discoverModels: discoverPiModels,
    defaultModel: "anthropic/claude-sonnet-4-6",
    supportsCustomPrompt: true,
    capabilities: {
      command: "pi",
      promptStrategy: "stdin",
      requiresPty: false,
      supportsModelSelection: true,
      authMethods: [
        { type: "auth-file", path: "~/.pi/agent/auth.json", description: "Pi agent auth file" },
        {
          type: "env",
          keys: ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GOOGLE_API_KEY", "GEMINI_API_KEY"],
        },
      ],
      relevantEnvVars: ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GOOGLE_API_KEY", "GEMINI_API_KEY"],
      supportsSessionCapture: true,
    },

    async execute(request) {
      const cmd = request.overrides?.command ?? "pi";

      // pi writes its session wherever it is pointed, so it can record straight
      // to the caller's path with nothing to copy afterwards.
      if (request.sessionFile) {
        try {
          fs.mkdirSync(path.dirname(request.sessionFile), { recursive: true });
        } catch {
          // A path that cannot be created just means no transcript.
        }
      }

      const args = [
        "-p",
        "--model",
        request.model,
        ...(request.sessionFile ? ["--session", request.sessionFile] : []),
        ...(request.overrides?.extraArgs ?? []),
      ];

      const result = await executeViaStdin(request, { cmd, args });
      const captured = Boolean(request.sessionFile && fs.existsSync(request.sessionFile));
      return captured ? { ...result, sessionFile: request.sessionFile } : result;
    },

    readTranscript(sessionFile: string): Transcript | null {
      return parsePiSession(sessionFile);
    },

    async healthCheck(): Promise<RuntimeHealth> {
      const check = await checkInstalled("pi", "pi");
      if (!check.installed) return check.health;

      let authenticated: "yes" | "no" | "unknown" = "no";
      let authDetail = "";

      const authFile = `${os.homedir()}/.pi/agent/auth.json`;
      if (fs.existsSync(authFile)) {
        authenticated = "yes";
        authDetail = "~/.pi/agent/auth.json";
      }

      if (authenticated === "no") {
        if (
          process.env.ANTHROPIC_API_KEY ||
          process.env.OPENAI_API_KEY ||
          process.env.GOOGLE_API_KEY ||
          process.env.GEMINI_API_KEY
        ) {
          authenticated = "yes";
          authDetail = "env: API key detected";
        } else {
          authDetail = "no ~/.pi/agent/auth.json and no API key env vars";
        }
      }

      return {
        name: "pi",
        command: "pi",
        installed: true,
        version: check.version,
        authenticated,
        authDetail,
        error: null,
      };
    },
  });
}

export const createAdapter = createPiRuntime;

export function parsePiSession(sessionFile: string): Transcript | null {
  const events = readJsonl(sessionFile);
  if (events.length === 0) return null;

  const messages: TranscriptMessage[] = [];
  let model: string | undefined;

  for (const event of events) {
    if (event.type === "model_change" && typeof event.modelId === "string") {
      model =
        typeof event.provider === "string" ? `${event.provider}/${event.modelId}` : event.modelId;
      continue;
    }
    if (event.type !== "message") continue;

    // pi nests the turn under `message`, and puts a tool result's call id on the
    // message rather than on its blocks.
    const message = asRecord(event.message);
    if (!message) continue;

    const role = String(message.role ?? "");
    const blocks = toBlocks(message, role);
    if (blocks.length === 0) continue;

    const base: TranscriptRole =
      role === "toolResult"
        ? "tool"
        : role === "user"
          ? "user"
          : role === "assistant"
            ? "assistant"
            : "system";

    messages.push({
      id: String(event.id ?? messages.length),
      role: roleFor(base, blocks),
      ...(typeof event.timestamp === "string" ? { at: event.timestamp } : {}),
      blocks,
    });
  }

  return buildTranscript("pi", messages, model);
}

function toBlocks(message: Record<string, unknown>, role: string): TranscriptBlock[] {
  const isResult = role === "toolResult";
  const content = message.content;
  const resultId = typeof message.toolCallId === "string" ? { toolUseId: message.toolCallId } : {};
  const resultOk = message.isError !== true;

  if (typeof content === "string") {
    if (!content.trim()) return [];
    return isResult
      ? [{ kind: "tool_result", ...resultId, ok: resultOk, text: content }]
      : [{ kind: "text", text: content }];
  }
  if (!Array.isArray(content)) return [];

  const blocks: TranscriptBlock[] = [];
  for (const raw of content) {
    const block = asRecord(raw);
    if (!block) continue;

    switch (block.type) {
      case "text": {
        const text = String(block.text ?? "");
        if (!text.trim()) break;
        blocks.push(
          isResult
            ? { kind: "tool_result", ...resultId, ok: resultOk, text }
            : { kind: "text", text },
        );
        break;
      }
      case "thinking": {
        const text = String(block.thinking ?? block.text ?? "");
        if (text.trim()) blocks.push({ kind: "thinking", text });
        break;
      }
      case "toolCall": {
        const name = String(block.name ?? block.toolName ?? "tool");
        const input = asRecord(block.arguments) ?? asRecord(block.input) ?? {};
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
      case "toolResult": {
        const toolUseId = block.toolCallId ?? block.id;
        blocks.push({
          kind: "tool_result",
          ...(typeof toolUseId === "string" ? { toolUseId } : resultId),
          ok: block.isError !== true && resultOk,
          text: flattenText(block.output ?? block.content ?? block.result),
        });
        break;
      }
    }
  }
  return blocks;
}
