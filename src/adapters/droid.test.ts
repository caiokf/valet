import { beforeEach, describe, expect, it, vi } from "vitest";
import { runAdapterContractTests } from "../tests/adapter-contract-tests.js";
import { buildRequest } from "../tests/test-helpers.js";
import { createDroidRuntime } from "./droid.js";

const { execAbortableMock } = vi.hoisted(() => ({
  execAbortableMock: vi.fn(),
}));

vi.mock("../exec.js", () => ({
  execAbortable: execAbortableMock,
}));

runAdapterContractTests({
  name: "droid",
  createRuntime: createDroidRuntime,
  defaultModel: "claude-sonnet-4-6",
  mockExec: () => execAbortableMock,
});

describe("droid adapter", () => {
  beforeEach(() => {
    execAbortableMock.mockReset();
  });

  it("builds expect script for droid with model", async () => {
    execAbortableMock.mockResolvedValue({ stdout: "droid-output", stderr: "" });

    const runtime = createDroidRuntime();
    const result = await runtime.execute(buildRequest({ model: "claude-sonnet-4-6" }));

    expect(execAbortableMock).toHaveBeenCalledWith(
      "expect",
      [
        "-c",
        'set f [open "/tmp/prompt.txt" r]; set prompt [read $f]; close $f; spawn "droid" "-p" "--model" "claude-sonnet-4-6" "$prompt"; set timeout 600; expect eof',
      ],
      expect.any(Object),
    );
    expect(result.raw).toBe("droid-output");
  });
});
