import fs from "node:fs";
import os from "node:os";
import { checkInstalled, executeViaStdin, extractVersion, withDefaults } from "../adapter-base.js";
import type { RuntimeAdapter, RuntimeHealth } from "../types.js";

export function createKimiRuntime(): RuntimeAdapter {
  return withDefaults({
    type: "cli",
    name: "kimi",
    models: ["kimi-k2.5", "kimi-k2-0905-preview", "kimi-k2-turbo-preview"] as const,
    defaultModel: "kimi-k2.5",
    supportsCustomPrompt: true,
    capabilities: {
      command: "kimi",
      promptStrategy: "stdin",
      requiresPty: false,
      supportsModelSelection: false,
      authMethods: [
        { type: "env", keys: ["MOONSHOT_API_KEY"] },
        {
          type: "auth-file",
          path: "~/.kimi/credentials",
          description: "Kimi credentials directory",
        },
      ],
      relevantEnvVars: ["MOONSHOT_API_KEY"],
    },

    async execute(request) {
      const cmd = request.overrides?.command ?? "kimi";
      const args = ["--print", ...(request.overrides?.extraArgs ?? [])];
      return executeViaStdin(request, { cmd, args });
    },

    async healthCheck(): Promise<RuntimeHealth> {
      const check = await checkInstalled("kimi", "kimi");
      if (!check.installed) return check.health;

      const version = extractVersion(check.version ?? "");

      let authenticated: "yes" | "no" | "unknown" = "no";
      let authDetail = "";

      if (process.env.MOONSHOT_API_KEY) {
        authenticated = "yes";
        authDetail = "env: MOONSHOT_API_KEY";
      } else {
        const credDir = `${os.homedir()}/.kimi/credentials`;
        try {
          if (fs.existsSync(credDir) && fs.readdirSync(credDir).length > 0) {
            authenticated = "yes";
            authDetail = "~/.kimi/credentials";
          }
        } catch {}
      }

      if (authenticated === "no") {
        authDetail = "no MOONSHOT_API_KEY and no ~/.kimi/credentials";
      }

      return {
        name: "kimi",
        command: "kimi",
        installed: true,
        version,
        authenticated,
        authDetail,
        error: null,
      };
    },
  });
}

export const createAdapter = createKimiRuntime;
