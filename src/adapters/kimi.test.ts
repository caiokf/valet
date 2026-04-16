import { beforeEach, describe, expect, it, vi } from "vitest";
import { runAdapterContractTests } from "../adapter-contract-tests.js";
import { buildRequest } from "../test-helpers.js";
import { createKimiRuntime } from "./kimi.js";

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
  name: "kimi",
  createRuntime: createKimiRuntime,
  defaultModel: "kimi-k2.5",
  mockExec: () => execAbortableMock,
});

describe("kimi adapter", () => {
  beforeEach(() => {
    execAbortableMock.mockReset();
    readFileSyncMock.mockReset().mockReturnValue("full prompt");
  });

  it("passes prompt file contents to kimi", async () => {
    execAbortableMock.mockResolvedValue({ stdout: "kimi-output", stderr: "" });

    const runtime = createKimiRuntime();
    const result = await runtime.execute(buildRequest({ model: "kimi-k2.5" }));

    expect(readFileSyncMock).toHaveBeenCalledWith("/tmp/prompt.txt", "utf-8");
    expect(execAbortableMock).toHaveBeenCalledWith(
      "kimi",
      ["--print"],
      expect.objectContaining({ stdin: "full prompt" }),
    );
    expect(result.raw).toBe("kimi-output");
  });
});
