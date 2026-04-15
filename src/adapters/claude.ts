import { execAbortable } from "../exec.js"
import { withDefaults } from "../adapter-base.js"
import type { RawExecutionOutput, RuntimeAdapter, RuntimeExecutionRequest, RuntimeHealth } from "../types.js"

export function createClaudeRuntime(): RuntimeAdapter {
  return withDefaults({
    type: "cli",
    name: "claude",
    models: ["opus", "sonnet", "haiku"] as const,
    defaultModel: "sonnet",
    supportsCustomPrompt: true,
    capabilities: {
      command: "claude",
      promptStrategy: "file-ref",
      requiresPty: false,
      supportsModelSelection: true,
      authMethods: [
        { type: "auth-command", command: ["claude", "auth", "status"] },
        { type: "env", keys: ["ANTHROPIC_API_KEY"] },
      ],
      relevantEnvVars: ["ANTHROPIC_API_KEY"],
    },

    async execute(request: RuntimeExecutionRequest): Promise<RawExecutionOutput> {
      const start = performance.now()
      const cmd = request.overrides?.command ?? "claude"
      const args = [
        "--model", resolveModel(request.model),
        "--dangerously-skip-permissions",
        "--output-format", "text",
        "-p", `Read and follow the instructions in this file: ${request.promptFile}`,
        ...(request.overrides?.extraArgs ?? []),
      ]
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
      const name = "claude"

      try {
        await execAbortable("which", ["claude"], { timeout: 5000 })
      } catch {
        return { name, command: "claude", installed: false, version: null, authenticated: "unknown", authDetail: "not installed", error: null }
      }

      let version: string | null = null
      try {
        const result = await execAbortable("claude", ["--version"], { timeout: 5000 })
        version = extractVersion(result.stdout.trim())
      } catch {}

      let authenticated: "yes" | "no" | "unknown" = "unknown"
      let authDetail = ""
      try {
        const authResult = await execAbortable("claude", ["auth", "status"], { timeout: 5000 })
        const output = authResult.stdout + authResult.stderr
        if (/logged.?in|loggedIn|authenticated|active|"loggedIn":\s*true/i.test(output)) {
          authenticated = "yes"
          authDetail = "claude auth status: authenticated"
        } else {
          authenticated = "no"
          authDetail = "claude auth status: not authenticated"
        }
      } catch {
        if (process.env.ANTHROPIC_API_KEY) {
          authenticated = "yes"
          authDetail = "env: ANTHROPIC_API_KEY"
        } else {
          authenticated = "unknown"
          authDetail = "could not determine (no env var, auth command failed)"
        }
      }

      return { name, command: "claude", installed: true, version, authenticated, authDetail, error: null }
    },
  })
}

function extractVersion(raw: string): string {
  const match = raw.match(/(\d+\.\d+\.\d+)/)
  return match ? match[1] : raw
}

function resolveModel(model: string): string {
  const map: Record<string, string> = {
    opus: "claude-opus-4-6",
    sonnet: "claude-sonnet-4-6",
    haiku: "claude-haiku-4-5-20251001",
  }
  return map[model] ?? model
}

export const createAdapter = createClaudeRuntime
