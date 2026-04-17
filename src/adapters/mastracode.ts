import fs from "node:fs";
import os from "node:os";
import { checkInstalled, runExpectCommand, stripAnsi, withDefaults } from "../adapter-base.js";
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
      const result = await runExpectCommand(request, [cmd, "--model", request.model, "-p"], {
        extraArgs: request.overrides?.extraArgs,
      });
      return { ...result, raw: stripAnsi(result.raw) };
    },

    async healthCheck(): Promise<RuntimeHealth> {
      const name = "mastracode";
      const check = await checkInstalled(name, "mastracode");
      if (!check.installed) return check.health;

      let authenticated: "yes" | "no" | "unknown" = "no";
      let authDetail = "";

      if (process.env.ANTHROPIC_API_KEY) {
        authenticated = "yes";
        authDetail = "env: ANTHROPIC_API_KEY";
      } else if (process.env.OPENAI_API_KEY) {
        authenticated = "yes";
        authDetail = "env: OPENAI_API_KEY";
      } else {
        const dbPath = `${os.homedir()}/.mastracode`;
        if (fs.existsSync(dbPath)) {
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
        version: check.version,
        authenticated,
        authDetail,
        error: null,
      };
    },
  });
}

export const createAdapter = createMastraCodeRuntime;
