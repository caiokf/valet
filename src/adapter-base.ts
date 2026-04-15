import { readFileSync } from "node:fs";
import { execAbortable } from "./exec.js";
import type {
  PreflightResult,
  RawExecutionOutput,
  RuntimeAdapter,
  RuntimeExecutionRequest,
  RuntimeHealth,
} from "./types.js";

export const EXEC_DEFAULTS = {
  maxBuffer: 50 * 1024 * 1024,
  defaultTimeout: 10 * 60 * 1000,
  healthTimeout: 5000,
  preflightTimeout: 3000,
} as const;

export function buildEnv(overrides?: Record<string, string>): Record<string, string> | undefined {
  if (!overrides || Object.keys(overrides).length === 0) {
    return undefined;
  }
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) {
      env[k] = v;
    }
  }
  for (const [k, v] of Object.entries(overrides)) {
    env[k] = v;
  }
  return env;
}

export function extractVersion(raw: string): string {
  const match = raw.match(/(\d+\.\d+\.\d+)/);
  return match ? match[1] : raw;
}

export async function runCommand(
  request: RuntimeExecutionRequest,
  cmd: string,
  args: string[],
  opts: { stdin?: string; timeoutMs?: number } = {},
): Promise<RawExecutionOutput> {
  const start = performance.now();
  const env = buildEnv(request.overrides?.env);
  try {
    const { stdout } = await execAbortable(cmd, args, {
      ...(env ? { env } : {}),
      maxBuffer: EXEC_DEFAULTS.maxBuffer,
      timeout: opts.timeoutMs ?? EXEC_DEFAULTS.defaultTimeout,
      signal: request.signal,
      stdin: opts.stdin,
    });
    return { raw: stdout, exitCode: 0, durationMs: performance.now() - start };
  } catch (error) {
    const err = error as { stdout?: string; code?: number };
    return {
      raw: err.stdout ?? String(error),
      exitCode: err.code ?? 1,
      durationMs: performance.now() - start,
    };
  }
}

export function buildExpectScript(
  promptFile: string,
  spawnCmd: string,
  timeoutSecs: number,
): string {
  return [
    `set f [open "${escapeTcl(promptFile)}" r]`,
    `set prompt [read $f]`,
    `close $f`,
    `spawn ${spawnCmd} $prompt`,
    `set timeout ${Math.ceil(timeoutSecs)}`,
    `expect eof`,
  ].join("; ");
}

export async function runExpectCommand(
  request: RuntimeExecutionRequest,
  spawnCmd: string,
  opts: { extraArgs?: string[]; timeoutMs?: number } = {},
): Promise<RawExecutionOutput> {
  const timeoutSecs = (opts.timeoutMs ?? EXEC_DEFAULTS.defaultTimeout) / 1000;
  const extraArgs = (opts.extraArgs ?? []).map(escapeTcl).join(" ");
  const fullSpawnCmd = [spawnCmd, extraArgs].filter(Boolean).join(" ");
  const script = buildExpectScript(request.promptFile, fullSpawnCmd, timeoutSecs);
  const env = buildEnv(request.overrides?.env);
  const start = performance.now();
  try {
    const { stdout } = await execAbortable("expect", ["-c", script], {
      ...(env ? { env } : {}),
      maxBuffer: EXEC_DEFAULTS.maxBuffer,
      timeout: opts.timeoutMs ?? EXEC_DEFAULTS.defaultTimeout,
      signal: request.signal,
    });
    return { raw: stdout, exitCode: 0, durationMs: performance.now() - start };
  } catch (error) {
    const err = error as { stdout?: string; code?: number };
    return {
      raw: err.stdout ?? String(error),
      exitCode: err.code ?? 1,
      durationMs: performance.now() - start,
    };
  }
}

export function withDefaults(
  adapter: Omit<RuntimeAdapter, "validateModel" | "preflight">,
): RuntimeAdapter {
  return {
    ...adapter,

    validateModel(model: string): boolean {
      return adapter.models.includes(model);
    },

    async preflight(
      request: Pick<RuntimeExecutionRequest, "model" | "overrides">,
    ): Promise<PreflightResult> {
      const issues: string[] = [];

      if (!adapter.models.includes(request.model) && request.model !== "default") {
        issues.push(
          `Model "${request.model}" is not in ${adapter.name}'s supported models: ${adapter.models.join(", ")}`,
        );
      }

      const cmd = request.overrides?.command ?? adapter.capabilities.command;
      try {
        await execAbortable("which", [cmd.split(" ")[0]], {
          timeout: EXEC_DEFAULTS.preflightTimeout,
        });
      } catch {
        issues.push(`Command "${cmd}" not found in PATH`);
      }

      return { ok: issues.length === 0, issues };
    },
  };
}

export async function executeViaStdin(
  request: RuntimeExecutionRequest,
  opts: { cmd: string; args: string[] },
): Promise<RawExecutionOutput> {
  const start = performance.now();
  const prompt = readFileSync(request.promptFile, "utf-8");
  const env = buildEnv(request.overrides?.env);

  try {
    const { stdout } = await execAbortable(opts.cmd, opts.args, {
      ...(env ? { env } : {}),
      maxBuffer: EXEC_DEFAULTS.maxBuffer,
      timeout: EXEC_DEFAULTS.defaultTimeout,
      signal: request.signal,
      stdin: prompt,
    });
    return { raw: stdout, exitCode: 0, durationMs: performance.now() - start };
  } catch (error) {
    const err = error as { stdout?: string; code?: number };
    return {
      raw: err.stdout ?? String(error),
      exitCode: err.code ?? 1,
      durationMs: performance.now() - start,
    };
  }
}

export async function checkInstalled(
  name: string,
  command: string,
  versionArgs: string[] = ["--version"],
): Promise<
  { installed: false; health: RuntimeHealth } | { installed: true; version: string | null }
> {
  try {
    await execAbortable("which", [command], { timeout: EXEC_DEFAULTS.healthTimeout });
  } catch {
    return {
      installed: false,
      health: {
        name,
        command,
        installed: false,
        version: null,
        authenticated: "unknown",
        authDetail: "not installed",
        error: null,
      },
    };
  }

  let version: string | null = null;
  try {
    const result = await execAbortable(command, versionArgs, {
      timeout: EXEC_DEFAULTS.healthTimeout,
    });
    version = result.stdout.trim();
  } catch {}

  return { installed: true, version };
}

export function escapeTcl(s: string): string {
  // biome-ignore lint: Tcl interprets these characters specially inside double-quoted strings
  return s.replace(/[\\$\[\]{}]/g, "\\$&");
}

export function stripAnsi(str: string): string {
  // biome-ignore lint: ANSI escape sequences contain literal control characters that must be matched with hex escapes
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]|\x1B\][^\x07]*\x07|\x1B\[[\?]?[0-9;]*[a-zA-Z]/g, "").replace(/\r/g, "");
}
