export type RuntimeType = "cli" | "api"

export type DiffInput = {
  diffContent: string
  diffFile: string
  base?: string
  baseCommit?: string
  type: "all" | "committed" | "uncommitted" | "current-state"
}

export type RuntimeOverrides = {
  command?: string
  env?: Record<string, string>
  extraArgs?: string[]
}

export type RuntimeExecutionRequest = {
  taskName: string
  model: string
  prompt: string
  promptFile: string
  outputFormat?: string
  signal?: AbortSignal
  diff?: DiffInput
  overrides?: RuntimeOverrides
}

export type RawExecutionOutput = {
  raw: string
  exitCode: number
  durationMs: number
}

export type RuntimeHealth = {
  name: string
  command: string
  installed: boolean
  version: string | null
  authenticated: "yes" | "no" | "unknown"
  authDetail: string
  error: string | null
}

// --- Capability descriptors ---

/** How the runtime receives prompts in headless mode */
export type PromptStrategy =
  | "stdin"          // Prompt piped via stdin (gemini, kimi, pi, copilot)
  | "file-ref"       // CLI reads a file path (claude: "Read file: <path>")
  | "file-arg"       // Prompt file path passed as CLI argument
  | "expect-script"  // TUI-only, driven via expect (opencode, droid, mastracode)
  | "native-review"  // Runtime has its own review engine (coderabbit)

/** How the runtime is authenticated */
export type AuthMethod = {
  type: "env"
  keys: string[]
} | {
  type: "auth-command"
  command: string[]
} | {
  type: "auth-file"
  path: string
  description: string
}

/** Structured metadata about runtime capabilities */
export type RuntimeCapabilities = {
  /** The default binary/command name */
  command: string
  /** How prompts are delivered in headless mode */
  promptStrategy: PromptStrategy
  /** Whether a PTY/expect is required (TUI-only tools) */
  requiresPty: boolean
  /** Whether model can be selected via CLI flag */
  supportsModelSelection: boolean
  /** Auth methods, checked in order during healthCheck */
  authMethods: AuthMethod[]
  /** Env vars that affect this runtime */
  relevantEnvVars: string[]
}

/** Pre-flight check result */
export type PreflightResult = {
  ok: boolean
  issues: string[]
}

export type RuntimeAdapter = {
  type: RuntimeType
  name: string
  models: readonly string[]
  defaultModel: string
  supportsCustomPrompt: boolean
  capabilities: RuntimeCapabilities

  /** Run a prompt headlessly and return raw output */
  execute(request: RuntimeExecutionRequest): Promise<RawExecutionOutput>

  /** Check if the runtime is installed and authenticated */
  healthCheck(): Promise<RuntimeHealth>

  /** Validate that a model string is supported by this runtime */
  validateModel(model: string): boolean

  /** Pre-flight check: can this runtime handle the given request? */
  preflight(request: Pick<RuntimeExecutionRequest, "model" | "overrides">): Promise<PreflightResult>
}
