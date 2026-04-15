import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { withDefaults, stripAnsi, escapeTcl } from "../adapter-base.js"
import { execAbortable } from "../exec.js"
import type { RawExecutionOutput, RuntimeAdapter, RuntimeExecutionRequest, RuntimeHealth } from "../types.js"

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
        { type: "auth-file", path: "~/.factory/auth.encrypted", description: "Factory encrypted auth" },
      ],
      relevantEnvVars: [],
    },

    async execute(request: RuntimeExecutionRequest): Promise<RawExecutionOutput> {
      const start = performance.now()
      const cmd = request.overrides?.command ?? "droid"
      const extraArgs = (request.overrides?.extraArgs ?? []).map(escapeTcl).join(" ")
      const spawnCmd = [`spawn ${cmd} -p --model ${escapeTcl(request.model)}`, extraArgs].filter(Boolean).join(" ")
      const expectScript = [
        `set f [open "${escapeTcl(request.promptFile)}" r]`,
        `set prompt [read $f]`,
        `close $f`,
        `${spawnCmd} $prompt`,
        `set timeout ${Math.ceil(10 * 60)}`,
        `expect eof`,
      ].join("; ")

      const env = request.overrides?.env && Object.keys(request.overrides.env).length > 0
        ? { ...process.env, ...request.overrides.env }
        : undefined

      try {
        const { stdout } = await execAbortable("expect", ["-c", expectScript], {
          ...(env ? { env } : {}),
          maxBuffer: 50 * 1024 * 1024,
          timeout: 10 * 60 * 1000,
          signal: request.signal,
        })

        return {
          raw: stripAnsi(stdout),
          exitCode: 0,
          durationMs: performance.now() - start,
        }
      } catch (error) {
        const err = error as { stdout?: string; code?: number }
        return {
          raw: err.stdout ? stripAnsi(err.stdout) : String(error),
          exitCode: err.code ?? 1,
          durationMs: performance.now() - start,
        }
      }
    },

    async healthCheck(): Promise<RuntimeHealth> {
      const name = "droid"

      try {
        await execAbortable("which", ["droid"], { timeout: 5000 })
      } catch {
        return { name, command: "droid", installed: false, version: null, authenticated: "unknown", authDetail: "not installed", error: null }
      }

      let version: string | null = null
      try {
        const result = await execAbortable("droid", ["--version"], { timeout: 5000 })
        version = result.stdout.trim() || null
      } catch {}

      let authenticated: "yes" | "no" | "unknown" = "no"
      let authDetail = ""

      const authFile = path.join(os.homedir(), ".factory", "auth.encrypted")
      try {
        if (fs.existsSync(authFile)) {
          authenticated = "yes"
          authDetail = "~/.factory/auth.encrypted"
        }
      } catch {}

      if (authenticated === "no") {
        authDetail = "no ~/.factory/auth.encrypted"
      }

      return { name, command: "droid", installed: true, version, authenticated, authDetail, error: null }
    },
  })
}

export const createAdapter = createDroidRuntime
