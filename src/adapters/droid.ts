import os from "node:os";
import fs from "node:fs";
import { withDefaults, runExpectCommand, checkInstalled, stripAnsi } from "../adapter-base.js";
import type {
  RawExecutionOutput,
  RuntimeAdapter,
  RuntimeExecutionRequest,
  RuntimeHealth,
} from "../types.js";

export function createDroidRuntime(): RuntimeAdapter {
  return withDefaults({
    type: "cli",
    name: "droid",
    models: [
      "claude-opus-4-6",
      "claude-sonnet-4-6",
      "gpt-5",
      "gpt-5-mini",
      "gemini-2.5-pro",
    ] as const,
    defaultModel: "claude-sonnet-4-6",
    supportsCustomPrompt: true,
    capabilities: {
      command: "droid",
      promptStrategy: "expect-script",
      requiresPty: true,
      supportsModelSelection: true,
      authMethods: [
        {
          type: "auth-file",
          path: "~/.factory/auth.encrypted",
          description: "Factory encrypted auth",
        },
      ],
      relevantEnvVars: [],
    },

    async execute(request: RuntimeExecutionRequest): Promise<RawExecutionOutput> {
      const cmd = request.overrides?.command ?? "droid";
      const result = await runExpectCommand(request, [cmd, "-p", "--model", request.model], {
        extraArgs: request.overrides?.extraArgs,
      });
      return { ...result, raw: stripAnsi(result.raw) };
    },

    async healthCheck(): Promise<RuntimeHealth> {
      const name = "droid";
      const check = await checkInstalled(name, "droid");
      if (!check.installed) return check.health;

      let authenticated: "yes" | "no" | "unknown" = "no";
      let authDetail = "";

      const authFile = `${os.homedir()}/.factory/auth.encrypted`;
      if (fs.existsSync(authFile)) {
        authenticated = "yes";
        authDetail = "~/.factory/auth.encrypted";
      }

      if (authenticated === "no") {
        authDetail = "no ~/.factory/auth.encrypted";
      }

      return {
        name,
        command: "droid",
        installed: true,
        version: check.version,
        authenticated,
        authDetail,
        error: null,
      };
    },
  });
}

export const createAdapter = createDroidRuntime;
