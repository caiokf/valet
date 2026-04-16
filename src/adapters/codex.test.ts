import { beforeEach, describe, expect, it, vi } from "vitest";
import { runAdapterContractTests } from "../adapter-contract-tests.js";
import { buildRequest } from "../test-helpers.js";
import { createCodexRuntime } from "./codex.js";

const { execAbortableMock } = vi.hoisted(() => ({
  execAbortableMock: vi.fn(),
}));

vi.mock("../exec.js", () => ({
  execAbortable: execAbortableMock,
}));

runAdapterContractTests({
  name: "codex",
  createRuntime: createCodexRuntime,
  defaultModel: "gpt-5.3-codex",
  mockExec: () => execAbortableMock,
});

describe("codex adapter", () => {
  beforeEach(() => {
    execAbortableMock.mockReset();
  });

  it("omits codex model flag when the default alias is requested", async () => {
    execAbortableMock.mockResolvedValue({ stdout: "ok", stderr: "" });

    const runtime = createCodexRuntime();
    await runtime.execute(buildRequest({ model: "default" }));

    expect(execAbortableMock).toHaveBeenCalledWith(
      "codex",
      ["exec", "--full-auto"],
      expect.objectContaining({
        stdin: "Read and follow the instructions in this file: /tmp/prompt.txt",
      }),
    );
  });

  it("adds codex model flag for explicit models", async () => {
    execAbortableMock.mockResolvedValue({ stdout: "ok", stderr: "" });

    const runtime = createCodexRuntime();
    await runtime.execute(buildRequest({ model: "gpt-5.4" }));

    expect(execAbortableMock).toHaveBeenCalledWith(
      "codex",
      ["exec", "--full-auto", "-m", "gpt-5.4"],
      expect.any(Object),
    );
  });
});
