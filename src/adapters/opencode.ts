import { execAbortable } from "../exec.js"
import { withDefaults, escapeTcl } from "../adapter-base.js"
import type { RawExecutionOutput, RuntimeAdapter, RuntimeExecutionRequest, RuntimeHealth } from "../types.js"

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
        { type: "auth-file", path: "~/.local/share/opencode/auth.json", description: "OpenCode auth file" },
      ],
      relevantEnvVars: [],
    },

    async execute(request: RuntimeExecutionRequest): Promise<RawExecutionOutput> {
      const start = performance.now()
      const cmd = request.overrides?.command ?? "opencode"
      const extraArgs = (request.overrides?.extraArgs ?? []).map(escapeTcl).join(" ")
      const spawnCmd = [`spawn ${cmd} run --format json -m ${escapeTcl(request.model)}`, extraArgs, "$prompt"].filter(Boolean).join(" ")
      const expectScript = [
        `set f [open "${escapeTcl(request.promptFile)}" r]`,
        `set prompt [read $f]`,
        `close $f`,
        spawnCmd,
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

        const { text, error: apiError } = parseOutput(stdout)

        if (apiError) {
          return {
            raw: `OpenCode error: ${apiError}`,
            exitCode: 1,
            durationMs: performance.now() - start,
          }
        }

        return {
          raw: text,
          exitCode: 0,
          durationMs: performance.now() - start,
        }
      } catch (error) {
        const err = error as { stdout?: string; code?: number }
        const parsed = err.stdout ? parseOutput(err.stdout) : null
        return {
          raw: parsed?.error || parsed?.text || String(error),
          exitCode: err.code ?? 1,
          durationMs: performance.now() - start,
        }
      }
    },

    async healthCheck(): Promise<RuntimeHealth> {
      const name = "opencode"

      try {
        await execAbortable("which", ["opencode"], { timeout: 5000 })
      } catch {
        return { name, command: "opencode", installed: false, version: null, authenticated: "unknown", authDetail: "not installed", error: null }
      }

      let version: string | null = null
      try {
        const result = await execAbortable("opencode", ["--version"], { timeout: 5000 })
        version = result.stdout.trim()
      } catch {}

      let authenticated: "yes" | "no" | "unknown" = "unknown"
      let authDetail = ""
      try {
        const { existsSync } = await import("node:fs")
        const { homedir } = await import("node:os")
        const authPath = `${homedir()}/.local/share/opencode/auth.json`
        if (existsSync(authPath)) {
          authenticated = "yes"
          authDetail = "~/.local/share/opencode/auth.json"
        } else {
          authenticated = "no"
          authDetail = "no auth file at ~/.local/share/opencode/auth.json"
        }
      } catch {
        authenticated = "unknown"
        authDetail = "could not check auth"
      }

      return { name, command: "opencode", installed: true, version, authenticated, authDetail, error: null }
    },
  })
}

type ParsedOutput = { text: string; error?: string }

function parseOutput(stdout: string): ParsedOutput {
  const clean = stdout.replace(/\r/g, "")
  const parts: string[] = []
  let error: string | undefined
  for (const line of clean.split("\n")) {
    if (!line.trim()) continue
    try {
      const event = JSON.parse(line) as {
        type: string
        part?: { type: string; text?: string }
        error?: { name?: string; data?: { message?: string } }
      }
      if (event.type === "text" && event.part?.text) {
        parts.push(event.part.text)
      } else if (event.type === "error" && event.error) {
        error = event.error.data?.message ?? event.error.name ?? "Unknown opencode error"
      }
    } catch {
      // skip non-JSON lines
    }
  }
  return { text: parts.join(""), error }
}

export const createAdapter = createOpenCodeRuntime
