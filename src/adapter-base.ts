import { readFileSync } from "node:fs"
import { execAbortable } from "./exec.js"
import type { PreflightResult, RawExecutionOutput, RuntimeAdapter, RuntimeExecutionRequest, RuntimeHealth } from "./types.js"

/**
 * Provides default implementations for validateModel and preflight.
 * Each runtime calls this with its adapter object to fill in shared behavior.
 */
export function withDefaults(
  adapter: Omit<RuntimeAdapter, "validateModel" | "preflight">,
): RuntimeAdapter {
  return {
    ...adapter,

    validateModel(model: string): boolean {
      return adapter.models.includes(model)
    },

    async preflight(request: Pick<RuntimeExecutionRequest, "model" | "overrides">): Promise<PreflightResult> {
      const issues: string[] = []

      // Check model validity
      if (!adapter.models.includes(request.model) && request.model !== "default") {
        issues.push(`Model "${request.model}" is not in ${adapter.name}'s supported models: ${adapter.models.join(", ")}`)
      }

      // Check installation
      const cmd = request.overrides?.command ?? adapter.capabilities.command
      try {
        await execAbortable("which", [cmd.split(" ")[0]], { timeout: 3000 })
      } catch {
        issues.push(`Command "${cmd}" not found in PATH`)
      }

      return { ok: issues.length === 0, issues }
    },
  }
}

/**
 * Shared stdin-based execution for adapters that pipe the prompt via stdin.
 * Each adapter provides its own cmd and args; this handles the common
 * try/catch, timing, env merging, and output shape.
 */
export async function executeViaStdin(
  request: RuntimeExecutionRequest,
  opts: { cmd: string; args: string[] },
): Promise<RawExecutionOutput> {
  const start = performance.now()
  const prompt = readFileSync(request.promptFile, "utf-8")
  const env = request.overrides?.env && Object.keys(request.overrides.env).length > 0
    ? { ...process.env, ...request.overrides.env }
    : undefined

  try {
    const { stdout } = await execAbortable(opts.cmd, opts.args, {
      ...(env ? { env } : {}),
      maxBuffer: 50 * 1024 * 1024,
      timeout: 10 * 60 * 1000,
      signal: request.signal,
      stdin: prompt,
    })
    return { raw: stdout, exitCode: 0, durationMs: performance.now() - start }
  } catch (error) {
    const err = error as { stdout?: string; code?: number }
    return { raw: err.stdout ?? String(error), exitCode: err.code ?? 1, durationMs: performance.now() - start }
  }
}

/**
 * Shared health check: verifies installation and fetches version.
 * Returns partial health data; callers add auth-specific fields.
 */
export async function checkInstalled(
  name: string,
  command: string,
  versionArgs: string[] = ["--version"],
): Promise<{ installed: false; health: RuntimeHealth } | { installed: true; version: string | null }> {
  try {
    await execAbortable("which", [command], { timeout: 5000 })
  } catch {
    return {
      installed: false,
      health: { name, command, installed: false, version: null, authenticated: "unknown", authDetail: "not installed", error: null },
    }
  }

  let version: string | null = null
  try {
    const result = await execAbortable(command, versionArgs, { timeout: 5000 })
    version = result.stdout.trim()
  } catch {}

  return { installed: true, version }
}

/**
 * Escape a string for safe use inside Tcl double-quoted strings.
 * Neutralizes brackets, dollar signs, and backslashes that Tcl interprets.
 */
export function escapeTcl(s: string): string {
  return s.replace(/[\\$\[\]{}]/g, "\\$&")
}

/**
 * Strip ANSI escape sequences and carriage returns from CLI output.
 */
export function stripAnsi(str: string): string {
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]|\x1B\][^\x07]*\x07|\x1B\[[\?]?[0-9;]*[a-zA-Z]/g, "").replace(/\r/g, "")
}
