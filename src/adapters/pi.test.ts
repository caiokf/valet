import { beforeEach, describe, expect, it, vi } from "vitest";
import { runAdapterContractTests } from "../adapter-contract-tests.js";
import { buildRequest } from "../test-helpers.js";
import { createPiRuntime } from "./pi.js";

const { execAbortableMock, readFileSyncMock } = vi.hoisted(() => ({
  execAbortableMock: vi.fn(),
  readFileSyncMock: vi.fn(),
}));

vi.mock("../exec.js", () => ({
  execAbortable: execAbortableMock,
}));

vi.mock("node:fs", () => ({
  default: { readFileSync: readFileSyncMock },
  readFileSync: readFileSyncMock,
}));

runAdapterContractTests({
  name: "pi",
  createRuntime: createPiRuntime,
  defaultModel: "anthropic/claude-sonnet-4-6",
  mockExec: () => execAbortableMock,
});

describe("pi adapter", () => {
  beforeEach(() => {
    execAbortableMock.mockReset();
    readFileSyncMock.mockReset().mockReturnValue("full prompt");
  });

  it("passes prompt via stdin to pi with model flag", async () => {
    execAbortableMock.mockResolvedValue({ stdout: "pi-output", stderr: "" });

    const runtime = createPiRuntime();
    const result = await runtime.execute(buildRequest({ model: "anthropic/claude-sonnet-4-6" }));

    expect(readFileSyncMock).toHaveBeenCalledWith("/tmp/prompt.txt", "utf-8");
    expect(execAbortableMock).toHaveBeenCalledWith(
      "pi",
      ["-p", "--model", "anthropic/claude-sonnet-4-6"],
      expect.objectContaining({ stdin: "full prompt" }),
    );
    expect(result.raw).toBe("pi-output");
  });

  it("passes extra args through for stdin-based runtimes", async () => {
    execAbortableMock.mockResolvedValue({ stdout: "ok", stderr: "" });

    const runtime = createPiRuntime();
    await runtime.execute(
      buildRequest({
        model: "anthropic/claude-sonnet-4-6",
        overrides: { extraArgs: ["--verbose"] },
      }),
    );

    expect(execAbortableMock).toHaveBeenCalledWith(
      "pi",
      ["-p", "--model", "anthropic/claude-sonnet-4-6", "--verbose"],
      expect.any(Object),
    );
  });
});
