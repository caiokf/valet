import os from "node:os";
import fs from "node:fs";
import { withDefaults, executeViaStdin, checkInstalled } from "../adapter-base.js";
import type { RuntimeAdapter, RuntimeHealth } from "../types.js";

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
    },

    async execute(request) {
      const cmd = request.overrides?.command ?? "pi";
      const args = ["-p", "--model", request.model, ...(request.overrides?.extraArgs ?? [])];
      return executeViaStdin(request, { cmd, args });
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
