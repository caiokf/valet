import { execAbortable } from "../exec.js";
import {
  withDefaults,
  runCommand,
  checkInstalled,
  extractVersion,
  EXEC_DEFAULTS,
} from "../adapter-base.js";
import type {
  RawExecutionOutput,
  RuntimeAdapter,
  RuntimeExecutionRequest,
  RuntimeHealth,
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
    },

    async execute(request: RuntimeExecutionRequest): Promise<RawExecutionOutput> {
      const cmd = request.overrides?.command ?? "claude";
      const args = [
        "--model",
        resolveModel(request.model),
        "--dangerously-skip-permissions",
        "--output-format",
        "text",
        "-p",
        `Read and follow the instructions in this file: ${request.promptFile}`,
        ...(request.overrides?.extraArgs ?? []),
      ];
      return runCommand(request, cmd, args);
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
