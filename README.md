# valet

[![CI](https://github.com/caiokf/valet/actions/workflows/ci.yml/badge.svg)](https://github.com/caiokf/valet/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/valet)](https://www.npmjs.com/package/valet)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

```
            _       _
 __   ____ | | ___ | |_
 \ \ / / _` | |/ _ \ __|
  \ V / (_| | |  __/ |_
   \_/ \__,_|_|\___|\__|
```

> Unified adapter layer for headlessly driving AI coding CLI tools.

One API to execute prompts, check health, and validate models across **10 AI coding runtimes**.

## Supported Runtimes

| Runtime | CLI Command | Strategy | PTY |
|---------|-------------|----------|-----|
| Claude | `claude` | file-ref | no |
| Codex | `codex` | stdin | no |
| Gemini | `gemini` | stdin | no |
| Kimi | `kimi` | stdin | no |
| CodeRabbit | `cr` | native-review | no |
| OpenCode | `opencode` | expect-script | yes |
| Pi | `pi` | stdin | no |
| Droid | `droid` | expect-script | yes |
| MastraCode | `mastracode` | expect-script | yes |
| Copilot | `gh` | file-ref | no |

## Install

```bash
npm install valet
```

## Usage

```typescript
import { getRuntime, getAllRuntimes, getRuntimeNames } from "valet"

// List all available runtimes
const names = getRuntimeNames()
// ["claude", "codex", "gemini", "kimi", "coderabbit", "opencode", "pi", "droid", "mastracode", "copilot"]

// Get a specific runtime adapter
const claude = getRuntime("claude")

// Check if a runtime is installed and authenticated
const health = await claude.healthCheck()
// { installed: true, authenticated: true, version: "1.0.0" }

// Validate a model
claude.validateModel("sonnet") // true

// Execute a prompt
const result = await claude.execute({
  taskName: "review-bugs",
  prompt: "Review this code for bugs",
  model: "sonnet",
  promptFile: "/path/to/prompt.txt",
})
// { raw: "...", exitCode: 0, durationMs: 1234 }
```

## Architecture

Valet provides a unified `RuntimeAdapter` interface that each CLI tool implements:

- **`execute(request)`** - Run a prompt headlessly and return raw output
- **`healthCheck()`** - Verify installation and authentication status
- **`validateModel(model)`** - Check if a model is supported
- **`preflight(request)`** - Pre-flight validation before execution

Prompt delivery strategies:
- **stdin** - Pipe the prompt via stdin
- **file-ref** - Reference a file for the CLI to read
- **file-arg** - Pass the prompt file path as a CLI argument
- **expect-script** - Drive TUI-only tools via `expect`
- **native-review** - Runtime has its own review engine

## Zero Dependencies

Valet has **zero runtime dependencies**. It only uses Node.js built-ins (`child_process`, `fs`, `path`, `os`).

## Development

```bash
pnpm install
pnpm build
pnpm test
```

## License

MIT
