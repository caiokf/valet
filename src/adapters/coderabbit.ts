import { execAbortable } from "../exec.js";
import { withDefaults, runCommand, checkInstalled, EXEC_DEFAULTS } from "../adapter-base.js";
import type {
  RawExecutionOutput,
  RuntimeAdapter,
  RuntimeExecutionRequest,
  RuntimeHealth,
} from "../types.js";

export function createCodeRabbitRuntime(): RuntimeAdapter {
  return withDefaults({
    type: "cli",
    name: "coderabbit",
    models: ["default"] as const,
    defaultModel: "default",
    supportsCustomPrompt: false,
    capabilities: {
      command: "cr",
      promptStrategy: "native-review",
      requiresPty: false,
      supportsModelSelection: false,
      authMethods: [{ type: "auth-command", command: ["cr", "auth", "status"] }],
      relevantEnvVars: [],
    },

    async execute(request: RuntimeExecutionRequest): Promise<RawExecutionOutput> {
      const cmd = request.overrides?.command ?? "cr";
      const args = ["review", "--prompt-only"];

      if (request.diff?.type && request.diff.type !== "all") {
        args.push("--type", request.diff.type);
      }
      if (request.diff?.base) {
        args.push("--base", request.diff.base);
      }
      if (request.diff?.baseCommit) {
        args.push("--base-commit", request.diff.baseCommit);
      }
      args.push(...(request.overrides?.extraArgs ?? []));

      return runCommand(request, cmd, args, { timeoutMs: 45 * 60 * 1000 });
    },

    async healthCheck(): Promise<RuntimeHealth> {
      const name = "coderabbit";
      const check = await checkInstalled(name, "cr");
      if (!check.installed) return check.health;

      let authenticated: "yes" | "no" | "unknown" = "unknown";
      let authDetail = "";
      try {
        const authResult = await execAbortable("cr", ["auth", "status"], {
          timeout: EXEC_DEFAULTS.healthTimeout,
        });
        const output = authResult.stdout + authResult.stderr;
        if (/logged in|authenticated|active/i.test(output)) {
          authenticated = "yes";
          authDetail = "cr auth status: authenticated";
        } else {
          authenticated = "no";
          authDetail = "cr auth status: not authenticated";
        }
      } catch {
        authenticated = "unknown";
        authDetail = "could not determine auth status";
      }

      return {
        name,
        command: "cr",
        installed: true,
        version: check.version,
        authenticated,
        authDetail,
        error: null,
      };
    },
  });
}

export const createAdapter = createCodeRabbitRuntime;
