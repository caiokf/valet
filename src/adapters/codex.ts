import os from "node:os";
import fs from "node:fs";
import { withDefaults, runCommand, checkInstalled } from "../adapter-base.js";
import type {
  RawExecutionOutput,
  RuntimeAdapter,
  RuntimeExecutionRequest,
  RuntimeHealth,
} from "../types.js";

export function createCodexRuntime(): RuntimeAdapter {
  return withDefaults({
    type: "cli",
    name: "codex",
    models: [
      "gpt-5.4",
      "gpt-5.4-mini",
      "gpt-5.3-codex",
      "gpt-5.2-codex",
      "gpt-5.2",
      "gpt-5.1-codex-max",
      "gpt-5.1-codex-mini",
    ] as const,
    defaultModel: "gpt-5.3-codex",
    supportsCustomPrompt: true,
    capabilities: {
      command: "codex",
      promptStrategy: "stdin",
      requiresPty: false,
      supportsModelSelection: true,
      authMethods: [
        { type: "env", keys: ["OPENAI_API_KEY"] },
        { type: "auth-file", path: "~/.codex/auth.json", description: "Codex CLI auth file" },
      ],
      relevantEnvVars: ["OPENAI_API_KEY"],
    },

    async execute(request: RuntimeExecutionRequest): Promise<RawExecutionOutput> {
      const cmd = request.overrides?.command ?? "codex";
      const args = ["exec", "--full-auto"];

      if (request.model !== "default") {
        args.push("-m", request.model);
      }
      args.push(...(request.overrides?.extraArgs ?? []));

      return runCommand(request, cmd, args, {
        stdin: `Read and follow the instructions in this file: ${request.promptFile}`,
      });
    },

    async healthCheck(): Promise<RuntimeHealth> {
      const name = "codex";
      const check = await checkInstalled(name, "codex");
      if (!check.installed) return check.health;

      let authenticated: "yes" | "no" | "unknown" = "no";
      let authDetail = "";

      if (process.env.OPENAI_API_KEY) {
        authenticated = "yes";
        authDetail = "env: OPENAI_API_KEY";
      } else {
        const authFile = `${os.homedir()}/.codex/auth.json`;
        if (fs.existsSync(authFile)) {
          authenticated = "yes";
          authDetail = "~/.codex/auth.json";
        }
      }

      if (authenticated === "no") {
        authDetail = "no OPENAI_API_KEY and no ~/.codex/auth.json";
      }

      return {
        name,
        command: "codex",
        installed: true,
        version: check.version,
        authenticated,
        authDetail,
        error: null,
      };
    },
  });
}

export const createAdapter = createCodexRuntime;
