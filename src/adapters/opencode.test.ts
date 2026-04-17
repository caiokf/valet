import { beforeEach, describe, expect, it, vi } from "vitest";
import { runAdapterContractTests } from "../tests/adapter-contract-tests.js";
import { buildRequest } from "../tests/test-helpers.js";
import { createOpenCodeRuntime } from "./opencode.js";

const { execAbortableMock } = vi.hoisted(() => ({
  execAbortableMock: vi.fn(),
}));

vi.mock("../exec.js", () => ({
  execAbortable: execAbortableMock,
}));

runAdapterContractTests({
  name: "opencode",
  createRuntime: createOpenCodeRuntime,
  defaultModel: "zai-coding-plan/glm-5",
  mockExec: () => execAbortableMock,
});

describe("opencode adapter", () => {
  beforeEach(() => {
    execAbortableMock.mockReset();
  });

  it("parses opencode text events into a single response", async () => {
    execAbortableMock.mockResolvedValue({
      stdout: '{"type":"text","part":{"text":"hello "}}\n{"type":"text","part":{"text":"world"}}\n',
      stderr: "",
    });

    const runtime = createOpenCodeRuntime();
    const result = await runtime.execute(buildRequest({ model: "zai/glm-5" }));

    expect(execAbortableMock).toHaveBeenCalledWith(
      "expect",
      [
        "-c",
        'set f [open "/tmp/prompt.txt" r]; set prompt [read $f]; close $f; spawn "opencode" "run" "--format" "json" "-m" "zai/glm-5" "$prompt"; set timeout 600; expect eof',
      ],
      expect.any(Object),
    );
    expect(result.raw).toBe("hello world");
    expect(result.exitCode).toBe(0);
  });

  it("returns parsed opencode API errors as failures", async () => {
    execAbortableMock.mockResolvedValue({
      stdout: '{"type":"error","error":{"data":{"message":"rate limited"}}}\n',
      stderr: "",
    });

    const runtime = createOpenCodeRuntime();
    const result = await runtime.execute(buildRequest());

    expect(result.raw).toBe("OpenCode error: rate limited");
    expect(result.exitCode).toBe(1);
  });
});
