import { describe, expect, it } from "vitest";
import { getAllRuntimes, getRuntimeNames } from "./registry.js";

const runtimes = getAllRuntimes();

describe("runtime adapter contract", () => {
  // Verify all runtimes are tested
  it("has at least 10 registered runtimes", () => {
    expect(runtimes.length).toBeGreaterThanOrEqual(10);
  });

  for (const runtime of runtimes) {
    describe(`${runtime.name}`, () => {
      // --- Identity ---
      it("has a non-empty name", () => {
        expect(runtime.name).toBeTruthy();
        expect(runtime.name).toMatch(/^[a-z][a-z0-9-]*$/);
      });

      it("has a type of cli or api", () => {
        expect(["cli", "api"]).toContain(runtime.type);
      });

      // --- Models ---
      it("has at least one model", () => {
        expect(runtime.models.length).toBeGreaterThan(0);
      });

      it("defaultModel is in models[]", () => {
        expect(runtime.models).toContain(runtime.defaultModel);
      });

      it("models have no duplicates", () => {
        const unique = new Set(runtime.models);
        expect(unique.size).toBe(runtime.models.length);
      });

      it("validateModel returns true for all declared models", () => {
        for (const model of runtime.models) {
          expect(runtime.validateModel(model)).toBe(true);
        }
      });

      it("validateModel returns false for a bogus model", () => {
        expect(runtime.validateModel("nonexistent-model-xyz")).toBe(false);
      });

      // --- Capabilities ---
      it("has capabilities object", () => {
        expect(runtime.capabilities).toBeDefined();
      });

      it("capabilities.command is non-empty", () => {
        expect(runtime.capabilities.command).toBeTruthy();
      });

      it("capabilities.promptStrategy is a known strategy", () => {
        expect(["stdin", "file-ref", "file-arg", "expect-script", "native-review"]).toContain(
          runtime.capabilities.promptStrategy,
        );
      });

      it("capabilities.requiresPty is boolean", () => {
        expect(typeof runtime.capabilities.requiresPty).toBe("boolean");
      });

      it("capabilities.supportsModelSelection is boolean", () => {
        expect(typeof runtime.capabilities.supportsModelSelection).toBe("boolean");
      });

      it("expect-script runtimes require PTY", () => {
        if (runtime.capabilities.promptStrategy === "expect-script") {
          expect(runtime.capabilities.requiresPty).toBe(true);
        }
      });

      it("non-expect runtimes do not require PTY", () => {
        if (runtime.capabilities.promptStrategy !== "expect-script") {
          expect(runtime.capabilities.requiresPty).toBe(false);
        }
      });

      // --- Auth methods ---
      it("has at least one auth method", () => {
        expect(runtime.capabilities.authMethods.length).toBeGreaterThan(0);
      });

      it("auth methods have valid types", () => {
        for (const auth of runtime.capabilities.authMethods) {
          expect(["env", "auth-command", "auth-file"]).toContain(auth.type);
          if (auth.type === "env") {
            expect(auth.keys.length).toBeGreaterThan(0);
          } else if (auth.type === "auth-command") {
            expect(auth.command.length).toBeGreaterThan(0);
          } else if (auth.type === "auth-file") {
            expect(auth.path).toBeTruthy();
            expect(auth.description).toBeTruthy();
          }
        }
      });

      it("relevantEnvVars is an array", () => {
        expect(Array.isArray(runtime.capabilities.relevantEnvVars)).toBe(true);
      });

      it("env auth method keys are in relevantEnvVars", () => {
        for (const auth of runtime.capabilities.authMethods) {
          if (auth.type === "env") {
            for (const key of auth.keys) {
              expect(runtime.capabilities.relevantEnvVars).toContain(key);
            }
          }
        }
      });

      // --- Methods ---
      it("has an execute method", () => {
        expect(typeof runtime.execute).toBe("function");
      });

      it("has a healthCheck method", () => {
        expect(typeof runtime.healthCheck).toBe("function");
      });

      it("has a preflight method", () => {
        expect(typeof runtime.preflight).toBe("function");
      });

      it("has a boolean supportsCustomPrompt", () => {
        expect(typeof runtime.supportsCustomPrompt).toBe("boolean");
      });

      // --- Cross-field consistency ---
      it("runtimes without model selection have single or default-only models", () => {
        if (!runtime.capabilities.supportsModelSelection) {
          // Either has only 1 model, or it's a special case like coderabbit
          expect(runtime.models.length).toBeLessThanOrEqual(3);
        }
      });

      it("name matches registry key", () => {
        const names = getRuntimeNames();
        expect(names).toContain(runtime.name);
      });
    });
  }
});
