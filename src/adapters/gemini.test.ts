import { beforeEach, describe, expect, it, vi } from "vitest"
import { createGeminiRuntime } from "./gemini.js"
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

describe("gemini adapter", () => {
  beforeEach(() => {
    execAbortableMock.mockReset()
    readFileSyncMock.mockReset()
  })

  it("passes prompt file contents to gemini", async () => {
    readFileSyncMock.mockReturnValue("full prompt")
    execAbortableMock.mockResolvedValue({ stdout: "gemini-output", stderr: "" })

    const runtime = createGeminiRuntime()
    const result = await runtime.execute(buildRequest({ model: "gemini-2.5-flash" }))

    expect(readFileSyncMock).toHaveBeenCalledWith("/tmp/prompt.txt", "utf-8")
    expect(execAbortableMock).toHaveBeenCalledWith(
      "gemini",
      ["-m", "gemini-2.5-flash"],
      expect.objectContaining({ stdin: "full prompt" }),
    )
    expect(result.raw).toBe("gemini-output")
  })
})
