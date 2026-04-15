import { beforeEach, describe, expect, it, vi } from "vitest"
import { createCodexRuntime } from "./codex.js"
import type { RuntimeExecutionRequest } from "../types.js"

const { execAbortableMock } = vi.hoisted(() => ({
  execAbortableMock: vi.fn(),
}))

vi.mock("../exec.js", () => ({
  execAbortable: execAbortableMock,
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

describe("codex adapter", () => {
  beforeEach(() => {
    execAbortableMock.mockReset()
  })

  it("omits codex model flag when the default alias is requested", async () => {
    execAbortableMock.mockResolvedValue({ stdout: "ok", stderr: "" })

    const runtime = createCodexRuntime()
    await runtime.execute(buildRequest({ model: "default" }))

    expect(execAbortableMock).toHaveBeenCalledWith(
      "codex",
      ["exec", "--full-auto"],
      expect.objectContaining({
        stdin: "Read and follow the instructions in this file: /tmp/prompt.txt",
      }),
    )
  })

  it("adds codex model flag for explicit models", async () => {
    execAbortableMock.mockResolvedValue({ stdout: "ok", stderr: "" })

    const runtime = createCodexRuntime()
    await runtime.execute(buildRequest({ model: "gpt-5.4" }))

    expect(execAbortableMock).toHaveBeenCalledWith(
      "codex",
      ["exec", "--full-auto", "-m", "gpt-5.4"],
      expect.any(Object),
    )
  })
})
