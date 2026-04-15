import { withDefaults, stripAnsi, escapeTcl } from "../adapter-base.js"
import { execAbortable } from "../exec.js"
import type { RawExecutionOutput, RuntimeAdapter, RuntimeExecutionRequest, RuntimeHealth } from "../types.js"

export function createMastraCodeRuntime(): RuntimeAdapter {
  return withDefaults({
    type: "cli",
    name: "mastracode",
    models: [
      "anthropic/claude-opus-4-6",
      "anthropic/claude-sonnet-4-6",
      "anthropic/claude-haiku-4-5-20251001",
      "openai/gpt-5",
      "openai/gpt-5-mini",
      "google/gemini-2.5-pro",
    ] as const,
    defaultModel: "anthropic/claude-sonnet-4-6",
    supportsCustomPrompt: true,
    capabilities: {
      command: "mastracode",
      promptStrategy: "expect-script",
      requiresPty: true,
      supportsModelSelection: true,
      authMethods: [
        { type: "env", keys: ["ANTHROPIC_API_KEY", "OPENAI_API_KEY"] },
        { type: "auth-file", path: "~/.mastracode", description: "MastraCode config directory" },
      ],
      relevantEnvVars: ["ANTHROPIC_API_KEY", "OPENAI_API_KEY"],
    },

    async execute(request: RuntimeExecutionRequest): Promise<RawExecutionOutput> {
      const start = performance.now()
      const cmd = request.overrides?.command ?? "mastracode"
      const extraArgs = (request.overrides?.extraArgs ?? []).map(escapeTcl).join(" ")
      const spawnCmd = [`spawn ${cmd} --model ${escapeTcl(request.model)} -p`, extraArgs].filter(Boolean).join(" ")
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
      const name = "mastracode"

      try {
        await execAbortable("which", ["mastracode"], { timeout: 5000 })
      } catch {
        return { name, command: "mastracode", installed: false, version: null, authenticated: "unknown", authDetail: "not installed", error: null }
      }

      let version: string | null = null
      try {
        await execAbortable("mastracode", ["--version"], { timeout: 2000 })
      } catch (e) {
        const err = e as { stdout?: string }
        const vMatch = (err.stdout ?? "").match(/v(\d+\.\d+\.\d+)/)
        version = vMatch ? vMatch[1] : null
      }

      let authenticated: "yes" | "no" | "unknown" = "no"
      let authDetail = ""

      if (process.env.ANTHROPIC_API_KEY) {
        authenticated = "yes"
        authDetail = "env: ANTHROPIC_API_KEY"
      } else if (process.env.OPENAI_API_KEY) {
        authenticated = "yes"
        authDetail = "env: OPENAI_API_KEY"
      } else {
        try {
          const { existsSync } = await import("node:fs")
          const { homedir } = await import("node:os")
          const dbPath = `${homedir()}/.mastracode`
          if (existsSync(dbPath)) {
            authenticated = "unknown"
            authDetail = "~/.mastracode exists (use /login in TUI to authenticate)"
          }
        } catch {}
      }

      if (authenticated === "no") {
        authDetail = "no API key env vars (use ANTHROPIC_API_KEY or /login in TUI)"
      }

      return { name, command: "mastracode", installed: true, version, authenticated, authDetail, error: null }
    },
  })
}

export const createAdapter = createMastraCodeRuntime
