import { beforeEach, describe, expect, it, vi } from "vitest";
import { runAdapterContractTests } from "../tests/adapter-contract-tests.js";
import { buildRequest } from "../tests/test-helpers.js";
import { createPiRuntime, discoverPiModels } from "./pi.js";

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

describe("pi discoverModels", () => {
  beforeEach(() => {
    readFileSyncMock.mockReset();
  });

  it("unions the static seed with ids from the models store", () => {
    readFileSyncMock.mockReturnValue(
      JSON.stringify({
        openai: { models: [{ id: "gpt-5.6-sol" }, { id: "gpt-5.6-terra" }] },
        zai: { models: [{ id: "glm-5.2" }, { id: "glm-5.2" }] },
        empty: {},
      }),
    );

    const models = discoverPiModels();

    expect(models).toEqual(
      expect.arrayContaining([
        "anthropic/claude-sonnet-4-6",
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "glm-5.2",
      ]),
    );
    // deduped across seed + store
    expect(new Set(models).size).toBe(models.length);
  });

  it("falls back to the static seed when the store is unreadable", () => {
    readFileSyncMock.mockImplementation(() => {
      throw new Error("ENOENT");
    });

    expect(discoverPiModels()).toEqual([
      "anthropic/claude-sonnet-4-6",
      "anthropic/claude-opus-4-6",
      "anthropic/claude-haiku-4-5-20251001",
      "google/gemini-2.5-pro",
      "google/gemini-2.5-flash",
      "openai/gpt-5",
      "openai/gpt-5-mini",
    ]);
  });
});
