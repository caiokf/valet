import { beforeEach, describe, expect, it, vi } from "vitest"
import { createKimiRuntime } from "./kimi.js"
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

describe("kimi adapter", () => {
  beforeEach(() => {
    execAbortableMock.mockReset()
    readFileSyncMock.mockReset()
  })

  it("passes prompt file contents to kimi", async () => {
    readFileSyncMock.mockReturnValue("full prompt")
    execAbortableMock.mockResolvedValue({ stdout: "kimi-output", stderr: "" })

    const runtime = createKimiRuntime()
    const result = await runtime.execute(buildRequest({ model: "kimi-k2.5" }))

    expect(readFileSyncMock).toHaveBeenCalledWith("/tmp/prompt.txt", "utf-8")
    expect(execAbortableMock).toHaveBeenCalledWith(
      "kimi",
      ["--print"],
      expect.objectContaining({ stdin: "full prompt" }),
    )
    expect(result.raw).toBe("kimi-output")
  })
})
