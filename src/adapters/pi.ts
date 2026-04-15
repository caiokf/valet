import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { withDefaults, executeViaStdin, checkInstalled } from "../adapter-base.js"
import type { RuntimeAdapter, RuntimeHealth } from "../types.js"

export function createPiRuntime(): RuntimeAdapter {
  return withDefaults({
    type: "cli",
    name: "pi",
    models: [
      "anthropic/claude-sonnet-4-6",
      "anthropic/claude-opus-4-6",
      "anthropic/claude-haiku-4-5-20251001",
      "google/gemini-2.5-pro",
      "google/gemini-2.5-flash",
      "openai/gpt-5",
      "openai/gpt-5-mini",
    ] as const,
    defaultModel: "anthropic/claude-sonnet-4-6",
    supportsCustomPrompt: true,
    capabilities: {
      command: "pi",
      promptStrategy: "stdin",
      requiresPty: false,
      supportsModelSelection: true,
      authMethods: [
        { type: "auth-file", path: "~/.pi/agent/auth.json", description: "Pi agent auth file" },
        { type: "env", keys: ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GOOGLE_API_KEY", "GEMINI_API_KEY"] },
      ],
      relevantEnvVars: ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GOOGLE_API_KEY", "GEMINI_API_KEY"],
    },

    async execute(request) {
      const cmd = request.overrides?.command ?? "pi"
      const args = ["-p", "--model", request.model, ...(request.overrides?.extraArgs ?? [])]
      return executeViaStdin(request, { cmd, args })
    },

    async healthCheck(): Promise<RuntimeHealth> {
      const check = await checkInstalled("pi", "pi")
      if (!check.installed) return check.health

      let authenticated: "yes" | "no" | "unknown" = "no"
      let authDetail = ""

      const authFile = path.join(os.homedir(), ".pi", "agent", "auth.json")
      try {
        if (fs.existsSync(authFile)) {
          authenticated = "yes"
          authDetail = "~/.pi/agent/auth.json"
        }
      } catch {}

      if (authenticated === "no") {
        if (process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY) {
          authenticated = "yes"
          authDetail = "env: API key detected"
        } else {
          authDetail = "no ~/.pi/agent/auth.json and no API key env vars"
        }
      }

      return { name: "pi", command: "pi", installed: true, version: check.version, authenticated, authDetail, error: null }
    },
  })
}

export const createAdapter = createPiRuntime
