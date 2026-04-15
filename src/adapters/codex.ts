import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { withDefaults } from "../adapter-base.js"
import { execAbortable } from "../exec.js"
import type { RawExecutionOutput, RuntimeAdapter, RuntimeExecutionRequest, RuntimeHealth } from "../types.js"

export function createCodexRuntime(): RuntimeAdapter {
  return withDefaults({
    type: "cli",
    name: "codex",
    models: [
      "gpt-5.4",
      "gpt-5.4-mini",
      "gpt-5.3-codex",
      "gpt-5.2-codex",
      "gpt-5.2",
      "gpt-5.1-codex-max",
      "gpt-5.1-codex-mini",
    ] as const,
    defaultModel: "gpt-5.3-codex",
    supportsCustomPrompt: true,
    capabilities: {
      command: "codex",
      promptStrategy: "file-ref",
      requiresPty: false,
      supportsModelSelection: true,
      authMethods: [
        { type: "env", keys: ["OPENAI_API_KEY"] },
        { type: "auth-file", path: "~/.codex/auth.json", description: "Codex CLI auth file" },
      ],
      relevantEnvVars: ["OPENAI_API_KEY"],
    },

    async execute(request: RuntimeExecutionRequest): Promise<RawExecutionOutput> {
      const start = performance.now()
      const cmd = request.overrides?.command ?? "codex"
      const args = ["exec", "--full-auto"]

      if (request.model !== "default") {
        args.push("-m", request.model)
      }
      args.push(...(request.overrides?.extraArgs ?? []))

      const env = request.overrides?.env && Object.keys(request.overrides.env).length > 0
        ? { ...process.env, ...request.overrides.env }
        : undefined

      try {
        const { stdout } = await execAbortable(cmd, args, {
          ...(env ? { env } : {}),
          maxBuffer: 50 * 1024 * 1024,
          timeout: 10 * 60 * 1000,
          signal: request.signal,
          stdin: `Read and follow the instructions in this file: ${request.promptFile}`,
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
      const name = "codex"

      try {
        await execAbortable("which", ["codex"], { timeout: 5000 })
      } catch {
        return { name, command: "codex", installed: false, version: null, authenticated: "unknown", authDetail: "not installed", error: null }
      }

      let version: string | null = null
      try {
        const result = await execAbortable("codex", ["--version"], { timeout: 5000 })
        const match = result.stdout.trim().match(/(\d+\.\d+\.\d+)/)
        version = match ? match[1] : result.stdout.trim()
      } catch {}

      let authenticated: "yes" | "no" | "unknown" = "no"
      let authDetail = ""

      if (process.env.OPENAI_API_KEY) {
        authenticated = "yes"
        authDetail = "env: OPENAI_API_KEY"
      } else {
        const authFile = path.join(os.homedir(), ".codex", "auth.json")
        try {
          if (fs.existsSync(authFile)) {
            authenticated = "yes"
            authDetail = "~/.codex/auth.json"
          }
        } catch {}
      }

      if (authenticated === "no") {
        authDetail = "no OPENAI_API_KEY and no ~/.codex/auth.json"
      }

      return { name, command: "codex", installed: true, version, authenticated, authDetail, error: null }
    },
  })
}

export const createAdapter = createCodexRuntime
