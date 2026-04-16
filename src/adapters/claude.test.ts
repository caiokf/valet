import { beforeEach, describe, expect, it, vi } from "vitest";
import { runAdapterContractTests } from "../adapter-contract-tests.js";
import { buildRequest } from "../test-helpers.js";
import { createClaudeRuntime } from "./claude.js";

const { execAbortableMock } = vi.hoisted(() => ({
  execAbortableMock: vi.fn(),
}));

vi.mock("../exec.js", () => ({
  execAbortable: execAbortableMock,
}));

runAdapterContractTests({
  name: "claude",
  createRuntime: createClaudeRuntime,
  defaultModel: "sonnet",
  mockExec: () => execAbortableMock,
});

describe("claude adapter", () => {
  beforeEach(() => {
    execAbortableMock.mockReset();
  });

  it("maps claude model aliases before execution", async () => {
    execAbortableMock.mockResolvedValue({ stdout: "ok", stderr: "" });

    const runtime = createClaudeRuntime();
    const result = await runtime.execute(
      buildRequest({ model: "opus", signal: new AbortController().signal }),
    );

    expect(execAbortableMock).toHaveBeenCalledWith(
      "claude",
      [
        "--model",
        "claude-opus-4-6",
        "--dangerously-skip-permissions",
        "--output-format",
        "text",
        "-p",
        "Read and follow the instructions in this file: /tmp/prompt.txt",
      ],
      expect.objectContaining({
        maxBuffer: 50 * 1024 * 1024,
      }),
    );
    expect(result.raw).toBe("ok");
    expect(result.exitCode).toBe(0);
  });

  it("uses captured stdout when an adapter command fails", async () => {
    execAbortableMock.mockRejectedValue(
      Object.assign(new Error("boom"), { stdout: "partial output", code: 9 }),
    );

    const runtime = createClaudeRuntime();
    const result = await runtime.execute(buildRequest());

    expect(result.raw).toBe("partial output");
    expect(result.exitCode).toBe(9);
  });

  it("respects command overrides", async () => {
    execAbortableMock.mockResolvedValue({ stdout: "ok", stderr: "" });

    const runtime = createClaudeRuntime();
    await runtime.execute(buildRequest({ model: "sonnet", overrides: { command: "cc" } }));

    expect(execAbortableMock).toHaveBeenCalledWith("cc", expect.any(Array), expect.any(Object));
  });
});
