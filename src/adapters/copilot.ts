import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { readFileSync } from "node:fs"
import { execAbortable } from "../exec.js"
import { withDefaults } from "../adapter-base.js"
import type { RawExecutionOutput, RuntimeAdapter, RuntimeExecutionRequest, RuntimeHealth } from "../types.js"

export function createCopilotRuntime(): RuntimeAdapter {
  return withDefaults({
    type: "cli",
    name: "copilot",
    models: [
      "gpt-5.2",
      "gpt-5.1",
      "claude-sonnet-4-6",
      "o4-mini",
      "gemini-2.5-pro",
    ] as const,
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
      const start = performance.now()
      const cmd = request.overrides?.command ?? "gh"
      const prompt = readFileSync(request.promptFile, "utf-8")

      const baseArgs = ["-p", prompt, "--model", request.model, "-s", "--allow-all-tools", "--deny-tool", "shell", ...(request.overrides?.extraArgs ?? [])]
      const args = cmd === "gh"
        ? ["copilot", "--", ...baseArgs]
        : baseArgs

      const env = request.overrides?.env && Object.keys(request.overrides.env).length > 0
        ? { ...process.env, ...request.overrides.env }
        : undefined

      try {
        const { stdout } = await execAbortable(cmd, args, {
          ...(env ? { env } : {}),
          maxBuffer: 50 * 1024 * 1024,
          timeout: 10 * 60 * 1000,
          signal: request.signal,
        })

        return {
          raw: stdout,
          exitCode: 0,
          durationMs: performance.now() - start,
        }
      } catch (error) {
        const err = error as { stdout?: string; code?: number }
        return {
          raw: err.stdout ?? String(error),
          exitCode: err.code ?? 1,
          durationMs: performance.now() - start,
        }
      }
    },

    async healthCheck(): Promise<RuntimeHealth> {
      const name = "copilot"

      try {
        await execAbortable("which", ["gh"], { timeout: 5000 })
      } catch {
        return { name, command: "copilot", installed: false, version: null, authenticated: "unknown", authDetail: "gh CLI not installed", error: null }
      }

      let version: string | null = null
      try {
        const result = await execAbortable("gh", ["copilot", "--", "--version"], { timeout: 5000 })
        const vMatch = (result.stdout + result.stderr).match(/(\d+\.\d+\.\d+)/)
        version = vMatch ? vMatch[1] : null
      } catch {
        return { name, command: "copilot", installed: false, version: null, authenticated: "unknown", authDetail: "copilot CLI not available (run: gh copilot)", error: null }
      }

      let authenticated: "yes" | "no" | "unknown" = "no"
      let authDetail = ""

      if (process.env.COPILOT_GITHUB_TOKEN) {
        authenticated = "yes"
        authDetail = "env: COPILOT_GITHUB_TOKEN"
      } else if (process.env.GH_TOKEN) {
        authenticated = "yes"
        authDetail = "env: GH_TOKEN"
      } else if (process.env.GITHUB_TOKEN) {
        authenticated = "yes"
        authDetail = "env: GITHUB_TOKEN"
      } else {
        try {
          const result = await execAbortable("gh", ["auth", "status"], { timeout: 5000 })
          const output = result.stdout + result.stderr
          if (/logged in|active/i.test(output)) {
            authenticated = "yes"
            authDetail = "gh auth"
          }
        } catch {}

        if (authenticated === "no") {
          const copilotDir = path.join(os.homedir(), ".copilot")
          try {
            if (fs.existsSync(copilotDir) && fs.readdirSync(copilotDir).some((f) => f.includes("config") || f.includes("auth"))) {
              authenticated = "unknown"
              authDetail = "~/.copilot exists (run: copilot login)"
            }
          } catch {}
        }
      }

      if (authenticated === "no") {
        authDetail = "not authenticated (run: gh copilot -- login)"
      }

      return { name, command: "copilot", installed: true, version, authenticated, authDetail, error: null }
    },
  })
}

export const createAdapter = createCopilotRuntime
