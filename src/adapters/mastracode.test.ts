import { beforeEach, describe, expect, it, vi } from "vitest";
import { runAdapterContractTests } from "../tests/adapter-contract-tests.js";
import { buildRequest } from "../tests/test-helpers.js";
import { createMastraCodeRuntime } from "./mastracode.js";

const { execAbortableMock } = vi.hoisted(() => ({
  execAbortableMock: vi.fn(),
}));

vi.mock("../exec.js", () => ({
  execAbortable: execAbortableMock,
}));

runAdapterContractTests({
  name: "mastracode",
  createRuntime: createMastraCodeRuntime,
  defaultModel: "anthropic/claude-sonnet-4-6",
  mockExec: () => execAbortableMock,
});

describe("mastracode adapter", () => {
  beforeEach(() => {
    execAbortableMock.mockReset();
  });

  it("builds expect script for mastracode with model", async () => {
    execAbortableMock.mockResolvedValue({ stdout: "mastra-output", stderr: "" });

    const runtime = createMastraCodeRuntime();
    const result = await runtime.execute(buildRequest({ model: "anthropic/claude-sonnet-4-6" }));

    expect(execAbortableMock).toHaveBeenCalledWith(
      "expect",
      [
        "-c",
        'set f [open "/tmp/prompt.txt" r]; set prompt [read $f]; close $f; spawn "mastracode" "--model" "anthropic/claude-sonnet-4-6" "-p" "$prompt"; set timeout 600; expect eof',
      ],
      expect.any(Object),
    );
    expect(result.raw).toBe("mastra-output");
  });
});
