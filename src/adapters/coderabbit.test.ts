import { beforeEach, describe, expect, it, vi } from "vitest";
import { runAdapterContractTests } from "../tests/adapter-contract-tests.js";
import { buildRequest } from "../tests/test-helpers.js";
import { createCodeRabbitRuntime } from "./coderabbit.js";

const { execAbortableMock } = vi.hoisted(() => ({
  execAbortableMock: vi.fn(),
}));

vi.mock("../exec.js", () => ({
  execAbortable: execAbortableMock,
}));

runAdapterContractTests({
  name: "coderabbit",
  createRuntime: createCodeRabbitRuntime,
  defaultModel: "default",
  mockExec: () => execAbortableMock,
});

describe("coderabbit adapter", () => {
  beforeEach(() => {
    execAbortableMock.mockReset();
  });

  it("passes diff flags through to coderabbit", async () => {
    execAbortableMock.mockResolvedValue({ stdout: "review", stderr: "" });

    const runtime = createCodeRabbitRuntime();
    await runtime.execute(
      buildRequest({
        diff: {
          diffContent: "diff",
          diffFile: "/tmp/diff.txt",
          type: "committed",
          base: "main",
          baseCommit: "abc123",
        },
      }),
    );

    expect(execAbortableMock).toHaveBeenCalledWith(
      "cr",
      [
        "review",
        "--prompt-only",
        "--type",
        "committed",
        "--base",
        "main",
        "--base-commit",
        "abc123",
      ],
      expect.any(Object),
    );
  });
});
