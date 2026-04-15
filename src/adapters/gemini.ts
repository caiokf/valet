import { withDefaults, executeViaStdin, checkInstalled } from "../adapter-base.js"
import type { RuntimeAdapter, RuntimeHealth } from "../types.js"

export function createGeminiRuntime(): RuntimeAdapter {
  return withDefaults({
    type: "cli",
    name: "gemini",
    models: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-3-pro-preview", "gemini-3-flash-preview"] as const,
    defaultModel: "gemini-2.5-pro",
    supportsCustomPrompt: true,
    capabilities: {
      command: "gemini",
      promptStrategy: "stdin",
      requiresPty: false,
      supportsModelSelection: true,
      authMethods: [
        { type: "env", keys: ["GEMINI_API_KEY", "GOOGLE_API_KEY"] },
      ],
      relevantEnvVars: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    },

    async execute(request) {
      const cmd = request.overrides?.command ?? "gemini"
      const args = ["-m", request.model, ...(request.overrides?.extraArgs ?? [])]
      return executeViaStdin(request, { cmd, args })
    },

    async healthCheck(): Promise<RuntimeHealth> {
      const check = await checkInstalled("gemini", "gemini")
      if (!check.installed) return check.health

      const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
      const authenticated: "yes" | "no" | "unknown" = apiKey ? "yes" : "no"
      const authDetail = apiKey
        ? `env: ${process.env.GEMINI_API_KEY ? "GEMINI_API_KEY" : "GOOGLE_API_KEY"}`
        : "env: GEMINI_API_KEY missing"

      return { name: "gemini", command: "gemini", installed: true, version: check.version, authenticated, authDetail, error: null }
    },
  })
}

export const createAdapter = createGeminiRuntime
