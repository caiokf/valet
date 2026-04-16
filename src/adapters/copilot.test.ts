import { beforeEach, describe, expect, it, vi } from "vitest";
import { runAdapterContractTests } from "../adapter-contract-tests.js";
import { buildRequest } from "../test-helpers.js";
import { createCopilotRuntime } from "./copilot.js";

const { execAbortableMock, readFileSyncMock } = vi.hoisted(() => ({
  execAbortableMock: vi.fn(),
  readFileSyncMock: vi.fn(),
}));

vi.mock("../exec.js", () => ({
  execAbortable: execAbortableMock,
}));

vi.mock("node:fs", () => ({
  default: {
    readFileSync: readFileSyncMock,
  },
  readFileSync: readFileSyncMock,
}));

runAdapterContractTests({
  name: "copilot",
  createRuntime: createCopilotRuntime,
  defaultModel: "gpt-5.2",
  mockExec: () => execAbortableMock,
});

describe("copilot adapter", () => {
  beforeEach(() => {
    execAbortableMock.mockReset();
    readFileSyncMock.mockReset().mockReturnValue("review this code");
  });

  it("passes prompt to copilot via gh wrapper with safety flags", async () => {
    execAbortableMock.mockResolvedValue({ stdout: "copilot-output", stderr: "" });

    const runtime = createCopilotRuntime();
    const result = await runtime.execute(buildRequest({ model: "gpt-5.2" }));

    expect(readFileSyncMock).toHaveBeenCalledWith("/tmp/prompt.txt", "utf-8");
    expect(execAbortableMock).toHaveBeenCalledWith(
      "gh",
      [
        "copilot",
        "--",
        "-p",
        "review this code",
        "--model",
        "gpt-5.2",
        "-s",
        "--allow-all-tools",
        "--deny-tool",
        "shell",
      ],
      expect.any(Object),
    );
    expect(result.raw).toBe("copilot-output");
  });

  it("copilot skips gh wrapper when command is overridden", async () => {
    execAbortableMock.mockResolvedValue({ stdout: "copilot-output", stderr: "" });

    const runtime = createCopilotRuntime();
    await runtime.execute(buildRequest({ model: "gpt-5.2", overrides: { command: "copilot" } }));

    expect(execAbortableMock).toHaveBeenCalledWith(
      "copilot",
      [
        "-p",
        "review this code",
        "--model",
        "gpt-5.2",
        "-s",
        "--allow-all-tools",
        "--deny-tool",
        "shell",
      ],
      expect.any(Object),
    );
  });
});
