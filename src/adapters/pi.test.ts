import { beforeEach, describe, expect, it, vi } from "vitest"
import { createPiRuntime } from "./pi.js"
import type { RuntimeExecutionRequest } from "../types.js"

const { execAbortableMock, readFileSyncMock } = vi.hoisted(() => ({
  execAbortableMock: vi.fn(),
  readFileSyncMock: vi.fn(),
}))

vi.mock("../exec.js", () => ({
  execAbortable: execAbortableMock,
}))

vi.mock("node:fs", () => ({
  readFileSync: readFileSyncMock,
}))

function buildRequest(overrides: Partial<RuntimeExecutionRequest> = {}): RuntimeExecutionRequest {
  return {
    taskName: "Reviewer",
    model: "default",
    prompt: "Prompt",
    promptFile: "/tmp/prompt.txt",
    outputFormat: '{"issues":[]}',
    ...overrides,
  }
}

describe("pi adapter", () => {
  beforeEach(() => {
    execAbortableMock.mockReset()
    readFileSyncMock.mockReset()
  })

  it("passes prompt via stdin to pi with model flag", async () => {
    readFileSyncMock.mockReturnValue("full prompt")
    execAbortableMock.mockResolvedValue({ stdout: "pi-output", stderr: "" })

    const runtime = createPiRuntime()
    const result = await runtime.execute(buildRequest({ model: "anthropic/claude-sonnet-4-6" }))

    expect(readFileSyncMock).toHaveBeenCalledWith("/tmp/prompt.txt", "utf-8")
    expect(execAbortableMock).toHaveBeenCalledWith(
      "pi",
      ["-p", "--model", "anthropic/claude-sonnet-4-6"],
      expect.objectContaining({ stdin: "full prompt" }),
    )
    expect(result.raw).toBe("pi-output")
  })

  it("passes extra args through for stdin-based runtimes", async () => {
    readFileSyncMock.mockReturnValue("prompt")
    execAbortableMock.mockResolvedValue({ stdout: "ok", stderr: "" })

    const runtime = createPiRuntime()
    await runtime.execute(buildRequest({ model: "anthropic/claude-sonnet-4-6", overrides: { extraArgs: ["--verbose"] } }))

    expect(execAbortableMock).toHaveBeenCalledWith(
      "pi",
      ["-p", "--model", "anthropic/claude-sonnet-4-6", "--verbose"],
      expect.any(Object),
    )
  })
})
