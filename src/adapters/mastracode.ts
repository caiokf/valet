import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { execAbortable } from "../exec.js";
import { withDefaults, runExpectCommand, EXEC_DEFAULTS } from "../adapter-base.js";
import type {
  RawExecutionOutput,
  RuntimeAdapter,
  RuntimeExecutionRequest,
  RuntimeHealth,
} from "../types.js";

export function createMastraCodeRuntime(): RuntimeAdapter {
  return withDefaults({
    type: "cli",
    name: "mastracode",
    models: [
      "anthropic/claude-opus-4-6",
      "anthropic/claude-sonnet-4-6",
      "anthropic/claude-haiku-4-5-20251001",
      "openai/gpt-5",
      "openai/gpt-5-mini",
      "google/gemini-2.5-pro",
    ] as const,
    defaultModel: "anthropic/claude-sonnet-4-6",
    supportsCustomPrompt: true,
    capabilities: {
      command: "mastracode",
      promptStrategy: "expect-script",
      requiresPty: true,
      supportsModelSelection: true,
      authMethods: [
        { type: "env", keys: ["ANTHROPIC_API_KEY", "OPENAI_API_KEY"] },
        { type: "auth-file", path: "~/.mastracode", description: "MastraCode config directory" },
      ],
      relevantEnvVars: ["ANTHROPIC_API_KEY", "OPENAI_API_KEY"],
    },

    async execute(request: RuntimeExecutionRequest): Promise<RawExecutionOutput> {
      const cmd = request.overrides?.command ?? "mastracode";
      const result = await runExpectCommand(request, `${cmd} --model ${request.model} -p`, {
        extraArgs: request.overrides?.extraArgs,
      });
      return {
        ...result,
        // biome-ignore lint: mastracode outputs ANSI codes that must be stripped
        raw: result.raw.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "").replace(/\r/g, ""),
      };
    },

    async healthCheck(): Promise<RuntimeHealth> {
      const name = "mastracode";
      try {
        await execAbortable("which", ["mastracode"], { timeout: EXEC_DEFAULTS.healthTimeout });
      } catch {
        return {
          name,
          command: "mastracode",
          installed: false,
          version: null,
          authenticated: "unknown",
          authDetail: "not installed",
          error: null,
        };
      }

      let version: string | null = null;
      try {
        await execAbortable("mastracode", ["--version"], { timeout: 2000 });
      } catch (e) {
        const err = e as { stdout?: string; stderr?: string };
        const vMatch = ((err.stdout ?? "") + (err.stderr ?? "")).match(/v?(\d+\.\d+\.\d+)/);
        version = vMatch ? vMatch[1] : null;
      }

      let authenticated: "yes" | "no" | "unknown" = "no";
      let authDetail = "";

      if (process.env.ANTHROPIC_API_KEY) {
        authenticated = "yes";
        authDetail = "env: ANTHROPIC_API_KEY";
      } else if (process.env.OPENAI_API_KEY) {
        authenticated = "yes";
        authDetail = "env: OPENAI_API_KEY";
      } else {
        const dbPath = `${homedir()}/.mastracode`;
        if (existsSync(dbPath)) {
          authenticated = "unknown";
          authDetail = "~/.mastracode exists (use /login in TUI to authenticate)";
        }
      }

      if (authenticated === "no") {
        authDetail = "no API key env vars (use ANTHROPIC_API_KEY or /login in TUI)";
      }

      return {
        name,
        command: "mastracode",
        installed: true,
        version,
        authenticated,
        authDetail,
        error: null,
      };
    },
  });
}

export const createAdapter = createMastraCodeRuntime;
