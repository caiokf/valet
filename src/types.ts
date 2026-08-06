export type RuntimeType = "cli" | "api";

export type DiffInput = {
  diffContent: string;
  diffFile: string;
  base?: string;
  baseCommit?: string;
  type: "all" | "committed" | "uncommitted" | "current-state";
};

export type RuntimeOverrides = {
  command?: string;
  env?: Record<string, string>;
  extraArgs?: string[];
};

export type RuntimeExecutionRequest = {
  taskName: string;
  model: string;
  prompt: string;
  promptFile: string;
  outputFormat?: string;
  signal?: AbortSignal;
  diff?: DiffInput;
  overrides?: RuntimeOverrides;
  /**
   * Record the run's conversation and leave it at this path.
   *
   * Every CLI already keeps its own session log; what differs is whether the
   * caller may choose where. Adapters that can write straight to a path do, and
   * adapters whose CLI insists on its own store copy the file here afterwards —
   * so a caller always finds the transcript exactly where it asked, whatever the
   * runtime underneath. Ignored by runtimes that cannot record one; check
   * `capabilities.supportsSessionCapture` first to know.
   */
  sessionFile?: string;
};

export type RawExecutionOutput = {
  raw: string;
  exitCode: number;
  durationMs: number;
  /**
   * Where the transcript was left, when one was requested and written. Absent
   * when the runtime cannot record one, or when the run died before it did.
   */
  sessionFile?: string;
};

export type RuntimeHealth = {
  name: string;
  command: string;
  installed: boolean;
  version: string | null;
  authenticated: "yes" | "no" | "unknown";
  authDetail: string;
  error: string | null;
};

// --- Capability descriptors ---

/** How the runtime receives prompts in headless mode */
export type PromptStrategy =
  | "stdin" // Prompt piped via stdin (gemini, kimi, pi)
  | "file-ref" // Prompt file read by adapter, content passed via CLI flag (claude, copilot)
  | "file-arg" // Prompt file path passed as CLI argument
  | "expect-script" // TUI-only, driven via expect (opencode, droid, mastracode)
  | "native-review"; // Runtime has its own review engine (coderabbit)

/** How the runtime is authenticated */
export type AuthMethod =
  | {
      type: "env";
      keys: string[];
    }
  | {
      type: "auth-command";
      command: string[];
    }
  | {
      type: "auth-file";
      path: string;
      description: string;
    };

/** Structured metadata about runtime capabilities */
export type RuntimeCapabilities = {
  /** The default binary/command name */
  command: string;
  /** How prompts are delivered in headless mode */
  promptStrategy: PromptStrategy;
  /** Whether a PTY/expect is required (TUI-only tools) */
  requiresPty: boolean;
  /** Whether model can be selected via CLI flag */
  supportsModelSelection: boolean;
  /** Auth methods, checked in order during healthCheck */
  authMethods: AuthMethod[];
  /** Env vars that affect this runtime */
  relevantEnvVars: string[];
  /** Whether `sessionFile` on a request produces a readable transcript */
  supportsSessionCapture: boolean;
};

/** Pre-flight check result */
export type PreflightResult = {
  ok: boolean;
  issues: string[];
};

export type RuntimeAdapter = {
  type: RuntimeType;
  name: string;
  models: readonly string[];
  defaultModel: string;
  supportsCustomPrompt: boolean;
  capabilities: RuntimeCapabilities;

  /** Run a prompt headlessly and return raw output */
  execute(request: RuntimeExecutionRequest): Promise<RawExecutionOutput>;

  /** Check if the runtime is installed and authenticated */
  healthCheck(): Promise<RuntimeHealth>;

  /** Validate that a model string is supported by this runtime */
  validateModel(model: string): boolean;

  /**
   * Discover the runtime's live model catalog from the CLI's own
   * configuration (e.g. a local models store), unioned with the static
   * `models` seed. Optional — consumers fall back to `models` when absent.
   */
  discoverModels?(): string[];

  /** Pre-flight check: can this runtime handle the given request? */
  preflight(
    request: Pick<RuntimeExecutionRequest, "model" | "overrides">,
  ): Promise<PreflightResult>;

  /**
   * Read a session file this adapter wrote back into the common transcript
   * shape. Knowing the CLI's own session schema is the same kind of knowledge as
   * knowing its flags, so it lives with the adapter rather than in every
   * consumer. Absent when the runtime cannot record a session.
   */
  readTranscript?(sessionFile: string): Transcript | null;
};

// --- Transcripts ---

/**
 * A run's conversation, normalised across runtimes.
 *
 * Each CLI writes its session in its own schema. Rather than teach every
 * consumer all of them, adapters flatten theirs into this shape: an ordered list
 * of messages, each a list of typed blocks. Anything that can render these can
 * render any runtime valet learns to capture.
 */
export type Transcript = {
  runtime: string;
  model?: string;
  messages: TranscriptMessage[];
  usage?: TranscriptUsage;
};

export type TranscriptUsage = {
  durationMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
};

export type TranscriptRole = "user" | "assistant" | "tool" | "system";

export type TranscriptMessage = {
  id: string;
  role: TranscriptRole;
  at?: string;
  blocks: TranscriptBlock[];
};

export type TranscriptBlock =
  | { kind: "text"; text: string }
  | { kind: "thinking"; text: string }
  | {
      kind: "tool_use";
      id?: string;
      name: string;
      input: Record<string, unknown>;
      /** One line standing in for the call when the block is collapsed. */
      summary: string;
    }
  | { kind: "tool_result"; toolUseId?: string; ok: boolean; text: string }
  /** An edit carrying its own before/after, so a consumer can draw a diff. */
  | { kind: "edit"; path: string; before: string; after: string };
