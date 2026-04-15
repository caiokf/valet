import { execAbortable } from "../exec.js"
import { withDefaults } from "../adapter-base.js"
import type { RawExecutionOutput, RuntimeAdapter, RuntimeExecutionRequest, RuntimeHealth } from "../types.js"

export function createCodeRabbitRuntime(): RuntimeAdapter {
  return withDefaults({
    type: "cli",
    name: "coderabbit",
    models: ["default"] as const,
    defaultModel: "default",
    supportsCustomPrompt: false,
    capabilities: {
      command: "cr",
      promptStrategy: "native-review",
      requiresPty: false,
      supportsModelSelection: false,
      authMethods: [
        { type: "auth-command", command: ["cr", "auth", "status"] },
      ],
      relevantEnvVars: [],
    },

    async execute(request: RuntimeExecutionRequest): Promise<RawExecutionOutput> {
      const start = performance.now()
      const cmd = request.overrides?.command ?? "cr"
      const args = ["review", "--prompt-only"]

      if (request.diff?.type && request.diff.type !== "all") {
        args.push("--type", request.diff.type)
      }
      if (request.diff?.base) {
        args.push("--base", request.diff.base)
      }
      if (request.diff?.baseCommit) {
        args.push("--base-commit", request.diff.baseCommit)
      }
      args.push(...(request.overrides?.extraArgs ?? []))

      const env = request.overrides?.env && Object.keys(request.overrides.env).length > 0
        ? { ...process.env, ...request.overrides.env }
        : undefined

      try {
        const { stdout } = await execAbortable(cmd, args, {
          ...(env ? { env } : {}),
          maxBuffer: 50 * 1024 * 1024,
          timeout: 45 * 60 * 1000,
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
      const name = "coderabbit"

      try {
        await execAbortable("which", ["cr"], { timeout: 5000 })
      } catch {
        return { name, command: "cr", installed: false, version: null, authenticated: "unknown", authDetail: "not installed", error: null }
      }

      let version: string | null = null
      try {
        const result = await execAbortable("cr", ["--version"], { timeout: 5000 })
        version = result.stdout.trim()
      } catch {}

      let authenticated: "yes" | "no" | "unknown" = "unknown"
      let authDetail = ""
      try {
        const authResult = await execAbortable("cr", ["auth", "status"], { timeout: 5000 })
        const output = authResult.stdout + authResult.stderr
        if (/logged in|authenticated|active/i.test(output)) {
          authenticated = "yes"
          authDetail = "cr auth status: authenticated"
        } else {
          authenticated = "no"
          authDetail = "cr auth status: not authenticated"
        }
      } catch {
        authenticated = "unknown"
        authDetail = "could not determine auth status"
      }

      return { name, command: "cr", installed: true, version, authenticated, authDetail, error: null }
    },
  })
}

export const createAdapter = createCodeRabbitRuntime
