import fs from "node:fs";
import os from "node:os";
import { EXEC_DEFAULTS, runCommand, withDefaults } from "../adapter-base.js";
import { execAbortable } from "../exec.js";
import type {
  RawExecutionOutput,
  RuntimeAdapter,
  RuntimeExecutionRequest,
  RuntimeHealth,
} from "../types.js";

export function createCopilotRuntime(): RuntimeAdapter {
  return withDefaults({
    type: "cli",
    name: "copilot",
    models: ["gpt-5.2", "gpt-5.1", "claude-sonnet-4-6", "o4-mini", "gemini-2.5-pro"] as const,
    defaultModel: "gpt-5.2",
    supportsCustomPrompt: true,
    capabilities: {
      command: "gh",
      promptStrategy: "stdin",
      requiresPty: false,
      supportsModelSelection: true,
      authMethods: [
        { type: "env", keys: ["COPILOT_GITHUB_TOKEN", "GH_TOKEN", "GITHUB_TOKEN"] },
        { type: "auth-command", command: ["gh", "auth", "status"] },
        { type: "auth-file", path: "~/.copilot", description: "Copilot config directory" },
      ],
      relevantEnvVars: ["COPILOT_GITHUB_TOKEN", "GH_TOKEN", "GITHUB_TOKEN"],
    },

    async execute(request: RuntimeExecutionRequest): Promise<RawExecutionOutput> {
      const cmd = request.overrides?.command ?? "gh";
      const prompt = fs.readFileSync(request.promptFile, "utf-8");

      const baseArgs = [
        "-p",
        prompt,
        "--model",
        request.model,
        "-s",
        "--allow-all-tools",
        "--deny-tool",
        "shell",
        ...(request.overrides?.extraArgs ?? []),
      ];
      const args = cmd === "gh" ? ["copilot", "--", ...baseArgs] : baseArgs;

      return runCommand(request, cmd, args);
    },

    async healthCheck(): Promise<RuntimeHealth> {
      const name = "copilot";

      try {
        await execAbortable("which", ["gh"], { timeout: EXEC_DEFAULTS.healthTimeout });
      } catch {
        return {
          name,
          command: "copilot",
          installed: false,
          version: null,
          authenticated: "unknown",
          authDetail: "gh CLI not installed",
          error: null,
        };
      }

      let version: string | null = null;
      try {
        const result = await execAbortable("gh", ["copilot", "--", "--version"], {
          timeout: EXEC_DEFAULTS.healthTimeout,
        });
        const vMatch = (result.stdout + result.stderr).match(/(\d+\.\d+\.\d+)/);
        version = vMatch ? vMatch[1] : null;
      } catch {
        return {
          name,
          command: "copilot",
          installed: false,
          version: null,
          authenticated: "unknown",
          authDetail: "copilot CLI not available (run: gh copilot)",
          error: null,
        };
      }

      let authenticated: "yes" | "no" | "unknown" = "no";
      let authDetail = "";

      if (process.env.COPILOT_GITHUB_TOKEN) {
        authenticated = "yes";
        authDetail = "env: COPILOT_GITHUB_TOKEN";
      } else if (process.env.GH_TOKEN) {
        authenticated = "yes";
        authDetail = "env: GH_TOKEN";
      } else if (process.env.GITHUB_TOKEN) {
        authenticated = "yes";
        authDetail = "env: GITHUB_TOKEN";
      } else {
        try {
          const result = await execAbortable("gh", ["auth", "status"], {
            timeout: EXEC_DEFAULTS.healthTimeout,
          });
          const output = result.stdout + result.stderr;
          if (/logged in|active/i.test(output)) {
            authenticated = "yes";
            authDetail = "gh auth";
          }
        } catch {}

        if (authenticated === "no") {
          const copilotDir = `${os.homedir()}/.copilot`;
          try {
            if (
              fs.existsSync(copilotDir) &&
              fs.readdirSync(copilotDir).some((f) => f.includes("config") || f.includes("auth"))
            ) {
              authenticated = "unknown";
              authDetail = "~/.copilot exists (run: copilot login)";
            }
          } catch {}
        }
      }

      if (authenticated === "no") {
        authDetail = "not authenticated (run: gh copilot -- login)";
      }

      return {
        name,
        command: "copilot",
        installed: true,
        version,
        authenticated,
        authDetail,
        error: null,
      };
    },
  });
}

export const createAdapter = createCopilotRuntime;
