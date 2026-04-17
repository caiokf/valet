import fs from "node:fs";
import os from "node:os";
import { checkInstalled, runExpectCommand, stripAnsi, withDefaults } from "../adapter-base.js";
import type {
  RawExecutionOutput,
  RuntimeAdapter,
  RuntimeExecutionRequest,
  RuntimeHealth,
} from "../types.js";

export function createOpenCodeRuntime(): RuntimeAdapter {
  return withDefaults({
    type: "cli",
    name: "opencode",
    models: [
      "zai-coding-plan/glm-5",
      "zai-coding-plan/glm-4.7",
      "zai-coding-plan/glm-4.7-flash",
      "zai/glm-5",
      "zai/glm-4.7",
      "zai/glm-4.7-flash",
      "openrouter/minimax/minimax-m2.7",
      "openrouter/minimax/minimax-m2.5",
      "openrouter/minimax/minimax-m2.1",
      "minimax-coding-plan/MiniMax-M2.7",
    ] as const,
    defaultModel: "zai-coding-plan/glm-5",
    supportsCustomPrompt: true,
    capabilities: {
      command: "opencode",
      promptStrategy: "expect-script",
      requiresPty: true,
      supportsModelSelection: true,
      authMethods: [
        {
          type: "auth-file",
          path: "~/.local/share/opencode/auth.json",
          description: "OpenCode auth file",
        },
      ],
      relevantEnvVars: [],
    },

    async execute(request: RuntimeExecutionRequest): Promise<RawExecutionOutput> {
      const cmd = request.overrides?.command ?? "opencode";
      const result = await runExpectCommand(request, [cmd, "run", "--format", "json", "-m", request.model], {
        extraArgs: request.overrides?.extraArgs,
      });
      const cleaned = stripAnsi(result.raw);
      const { text, error: apiError } = parseOutput(cleaned);

      if (apiError) {
        return { ...result, raw: `OpenCode error: ${apiError}`, exitCode: 1 };
      }

      return { ...result, raw: text };
    },

    async healthCheck(): Promise<RuntimeHealth> {
      const name = "opencode";
      const check = await checkInstalled(name, "opencode");
      if (!check.installed) return check.health;

      let authenticated: "yes" | "no" | "unknown" = "unknown";
      let authDetail = "";
      try {
        const authPath = `${os.homedir()}/.local/share/opencode/auth.json`;
        if (fs.existsSync(authPath)) {
          authenticated = "yes";
          authDetail = "~/.local/share/opencode/auth.json";
        } else {
          authenticated = "no";
          authDetail = "no auth file at ~/.local/share/opencode/auth.json";
        }
      } catch {
        authenticated = "unknown";
        authDetail = "could not check auth";
      }

      return {
        name,
        command: "opencode",
        installed: true,
        version: check.version,
        authenticated,
        authDetail,
        error: null,
      };
    },
  });
}

type ParsedOutput = { text: string; error?: string };

function parseOutput(stdout: string): ParsedOutput {
  const parts: string[] = [];
  let error: string | undefined;
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line) as {
        type: string;
        part?: { type: string; text?: string };
        error?: { name?: string; data?: { message?: string } };
      };
      if (event.type === "text" && event.part?.text) {
        parts.push(event.part.text);
      } else if (event.type === "error" && event.error) {
        error = event.error.data?.message ?? event.error.name ?? "Unknown opencode error";
      }
    } catch {
      // skip non-JSON lines
    }
  }
  return { text: parts.join(""), error };
}

export const createAdapter = createOpenCodeRuntime;
