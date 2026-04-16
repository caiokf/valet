import type { Mock } from "vitest";
import { describe, expect, it } from "vitest";
import { buildRequest } from "./test-helpers.js";
import type { RuntimeAdapter } from "../types.js";

export interface AdapterTestConfig {
  name: string;
  createRuntime: () => RuntimeAdapter;
  defaultModel: string;
  mockExec: () => Mock;
}

export function runAdapterContractTests(config: AdapterTestConfig) {
  const { name, createRuntime, defaultModel, mockExec } = config;

  describe(`${name} adapter contract`, () => {
    describe("validateModel", () => {
      it("accepts a valid model", () => {
        const runtime = createRuntime();
        expect(runtime.validateModel(defaultModel)).toBe(true);
      });

      it("rejects an invalid model", () => {
        const runtime = createRuntime();
        expect(runtime.validateModel("nonexistent-model-xyz")).toBe(false);
      });
    });

    describe("preflight", () => {
      it("passes for valid model when command is installed", async () => {
        mockExec().mockResolvedValue({ stdout: "/usr/local/bin/test", stderr: "" });

        const runtime = createRuntime();
        const result = await runtime.preflight({ model: defaultModel });

        expect(result.ok).toBe(true);
        expect(result.issues).toHaveLength(0);
      });

      it("reports issue for unknown model", async () => {
        mockExec().mockResolvedValue({ stdout: "/usr/local/bin/test", stderr: "" });

        const runtime = createRuntime();
        const result = await runtime.preflight({ model: "nonexistent-model-xyz" });

        expect(result.ok).toBe(false);
        expect(result.issues).toEqual(expect.arrayContaining([expect.stringContaining("not in")]));
      });

      it("reports issue when command not found", async () => {
        mockExec().mockRejectedValue(new Error("not found"));

        const runtime = createRuntime();
        const result = await runtime.preflight({ model: defaultModel });

        expect(result.ok).toBe(false);
        expect(result.issues).toEqual(
          expect.arrayContaining([expect.stringContaining("not found")]),
        );
      });
    });

    describe("execute", () => {
      it("returns raw output and exitCode 0 on success", async () => {
        mockExec().mockResolvedValue({ stdout: "test-output", stderr: "" });

        const runtime = createRuntime();
        const result = await runtime.execute(buildRequest({ model: defaultModel }));

        expect(typeof result.raw).toBe("string");
        expect(result.exitCode).toBe(0);
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
      });

      it("returns error output and non-zero exitCode on failure", async () => {
        mockExec().mockRejectedValue(
          Object.assign(new Error("boom"), { stdout: "partial", code: 7 }),
        );

        const runtime = createRuntime();
        const result = await runtime.execute(buildRequest({ model: defaultModel }));

        expect(result.exitCode).toBe(7);
      });
    });
  });
}
