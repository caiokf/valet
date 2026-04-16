import { beforeEach, describe, expect, it, vi } from "vitest";
import { runAdapterContractTests } from "../adapter-contract-tests.js";
import { buildRequest } from "../test-helpers.js";
import { createGeminiRuntime } from "./gemini.js";

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
  name: "gemini",
  createRuntime: createGeminiRuntime,
  defaultModel: "gemini-2.5-pro",
  mockExec: () => execAbortableMock,
});

describe("gemini adapter", () => {
  beforeEach(() => {
    execAbortableMock.mockReset();
    readFileSyncMock.mockReset().mockReturnValue("full prompt");
  });

  it("passes prompt file contents to gemini", async () => {
    execAbortableMock.mockResolvedValue({ stdout: "gemini-output", stderr: "" });

    const runtime = createGeminiRuntime();
    const result = await runtime.execute(buildRequest({ model: "gemini-2.5-flash" }));

    expect(readFileSyncMock).toHaveBeenCalledWith("/tmp/prompt.txt", "utf-8");
    expect(execAbortableMock).toHaveBeenCalledWith(
      "gemini",
      ["-m", "gemini-2.5-flash"],
      expect.objectContaining({ stdin: "full prompt" }),
    );
    expect(result.raw).toBe("gemini-output");
  });
});
