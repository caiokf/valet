import { describe, expect, it } from "vitest"
import { getAllRuntimes, getRuntime, getRuntimeNames } from "./registry.js"

describe("registry", () => {
  it("returns the expected runtime names", () => {
    expect(getRuntimeNames()).toEqual(["claude", "codex", "gemini", "kimi", "coderabbit", "opencode", "pi", "droid", "mastracode", "copilot"])
  })

  it("creates each runtime adapter", () => {
    const runtimes = getAllRuntimes()

    expect(runtimes).toHaveLength(10)
    expect(runtimes.map((runtime) => runtime.name)).toEqual(getRuntimeNames())
  })

  it("returns a runtime by name", () => {
    const runtime = getRuntime("claude")

    expect(runtime.name).toBe("claude")
    expect(runtime.defaultModel).toBe("sonnet")
  })

  it("throws a helpful error for unknown runtimes", () => {
    expect(() => getRuntime("missing")).toThrowError(
      'Unknown runtime: "missing". Available: claude, codex, gemini, kimi, coderabbit, opencode, pi, droid, mastracode, copilot',
    )
  })
})
