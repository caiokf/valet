import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCodeRabbitRuntime } from "./coderabbit.js";
import { buildRequest } from "../test-helpers.js";

const { execAbortableMock } = vi.hoisted(() => ({
  execAbortableMock: vi.fn(),
}));

vi.mock("../exec.js", () => ({
  execAbortable: execAbortableMock,
}));

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
