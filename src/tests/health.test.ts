import fs from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClaudeRuntime } from "../adapters/claude.js";
import { createCodexRuntime } from "../adapters/codex.js";
import { createGeminiRuntime } from "../adapters/gemini.js";
import { createKimiRuntime } from "../adapters/kimi.js";
import { createCodeRabbitRuntime } from "../adapters/coderabbit.js";
import { createOpenCodeRuntime } from "../adapters/opencode.js";
import { createPiRuntime } from "../adapters/pi.js";
import { createDroidRuntime } from "../adapters/droid.js";
import { createMastraCodeRuntime } from "../adapters/mastracode.js";
import { createCopilotRuntime } from "../adapters/copilot.js";

const { execAbortableMock } = vi.hoisted(() => ({
  execAbortableMock: vi.fn(),
}));

vi.mock("../exec.js", () => ({
  execAbortable: execAbortableMock,
}));

describe("healthCheck", () => {
  beforeEach(() => {
    execAbortableMock.mockReset();
  });

  describe("claude", () => {
    it("returns not installed when which fails", async () => {
      execAbortableMock.mockRejectedValue(new Error("not found"));

      const runtime = createClaudeRuntime();
      const health = await runtime.healthCheck();

      expect(health.name).toBe("claude");
      expect(health.installed).toBe(false);
      expect(health.authenticated).toBe("unknown");
    });

    it("returns authenticated when auth status returns JSON with loggedIn", async () => {
      execAbortableMock
        .mockResolvedValueOnce({ stdout: "/usr/local/bin/claude", stderr: "" }) // which
        .mockResolvedValueOnce({ stdout: "1.0.93", stderr: "" }) // --version
        .mockResolvedValueOnce({
          stdout: '{"loggedIn": true, "email": "user@test.com"}',
          stderr: "",
        }); // auth status

      const runtime = createClaudeRuntime();
      const health = await runtime.healthCheck();

      expect(health.installed).toBe(true);
      expect(health.authenticated).toBe("yes");
    });

    it("returns installed and authenticated via auth status", async () => {
      execAbortableMock
        .mockResolvedValueOnce({ stdout: "/usr/local/bin/claude", stderr: "" }) // which
        .mockResolvedValueOnce({ stdout: "1.0.93", stderr: "" }) // --version
        .mockResolvedValueOnce({ stdout: "Logged in as user", stderr: "" }); // auth status

      const runtime = createClaudeRuntime();
      const health = await runtime.healthCheck();

      expect(health.installed).toBe(true);
      expect(health.version).toBe("1.0.93");
      expect(health.authenticated).toBe("yes");
    });

    it("falls back to env var when auth command fails", async () => {
      const origKey = process.env.ANTHROPIC_API_KEY;
      process.env.ANTHROPIC_API_KEY = "sk-test";

      execAbortableMock
        .mockResolvedValueOnce({ stdout: "/usr/local/bin/claude", stderr: "" }) // which
        .mockResolvedValueOnce({ stdout: "1.0.0", stderr: "" }) // --version
        .mockRejectedValueOnce(new Error("auth failed")); // auth status

      const runtime = createClaudeRuntime();
      const health = await runtime.healthCheck();

      expect(health.authenticated).toBe("yes");
      expect(health.authDetail).toBe("env: ANTHROPIC_API_KEY");

      process.env.ANTHROPIC_API_KEY = origKey;
    });

    it("returns unknown auth when no env var and auth fails", async () => {
      const origKey = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      execAbortableMock
        .mockResolvedValueOnce({ stdout: "/usr/local/bin/claude", stderr: "" }) // which
        .mockResolvedValueOnce({ stdout: "1.0.0", stderr: "" }) // --version
        .mockRejectedValueOnce(new Error("auth failed")); // auth status

      const runtime = createClaudeRuntime();
      const health = await runtime.healthCheck();

      expect(health.authenticated).toBe("unknown");

      process.env.ANTHROPIC_API_KEY = origKey;
    });
  });

  describe("codex", () => {
    it("returns not installed when which fails", async () => {
      execAbortableMock.mockRejectedValue(new Error("not found"));

      const runtime = createCodexRuntime();
      const health = await runtime.healthCheck();

      expect(health.installed).toBe(false);
    });

    it("returns authenticated when OPENAI_API_KEY is set", async () => {
      const origKey = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = "sk-test";

      execAbortableMock
        .mockResolvedValueOnce({ stdout: "/usr/local/bin/codex", stderr: "" }) // which
        .mockResolvedValueOnce({ stdout: "0.1.2", stderr: "" }); // --version

      const runtime = createCodexRuntime();
      const health = await runtime.healthCheck();

      expect(health.installed).toBe(true);
      expect(health.authenticated).toBe("yes");
      expect(health.authDetail).toBe("env: OPENAI_API_KEY");

      process.env.OPENAI_API_KEY = origKey;
    });

    it("returns not authenticated when OPENAI_API_KEY is missing and no auth file", async () => {
      const origKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      execAbortableMock
        .mockResolvedValueOnce({ stdout: "/usr/local/bin/codex", stderr: "" })
        .mockResolvedValueOnce({ stdout: "0.1.2", stderr: "" });

      const existsSpy = vi.spyOn(fs, "existsSync").mockReturnValue(false);

      const runtime = createCodexRuntime();
      const health = await runtime.healthCheck();

      expect(health.authenticated).toBe("no");

      existsSpy.mockRestore();
      process.env.OPENAI_API_KEY = origKey;
    });

    it("returns authenticated via ~/.codex/auth.json when no env var", async () => {
      const origKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      execAbortableMock
        .mockResolvedValueOnce({ stdout: "/usr/local/bin/codex", stderr: "" })
        .mockResolvedValueOnce({ stdout: "0.1.2", stderr: "" });

      const existsSpy = vi.spyOn(fs, "existsSync").mockReturnValue(true);

      const runtime = createCodexRuntime();
      const health = await runtime.healthCheck();

      expect(health.authenticated).toBe("yes");
      expect(health.authDetail).toBe("~/.codex/auth.json");

      existsSpy.mockRestore();
      process.env.OPENAI_API_KEY = origKey;
    });
  });

  describe("gemini", () => {
    it("returns authenticated when GEMINI_API_KEY is set", async () => {
      const origKey = process.env.GEMINI_API_KEY;
      process.env.GEMINI_API_KEY = "test-key";

      execAbortableMock
        .mockResolvedValueOnce({ stdout: "/usr/local/bin/gemini", stderr: "" })
        .mockResolvedValueOnce({ stdout: "0.2.1", stderr: "" });

      const runtime = createGeminiRuntime();
      const health = await runtime.healthCheck();

      expect(health.authenticated).toBe("yes");
      expect(health.authDetail).toBe("env: GEMINI_API_KEY");

      process.env.GEMINI_API_KEY = origKey;
    });

    it("falls back to GOOGLE_API_KEY", async () => {
      const origGemini = process.env.GEMINI_API_KEY;
      const origGoogle = process.env.GOOGLE_API_KEY;
      delete process.env.GEMINI_API_KEY;
      process.env.GOOGLE_API_KEY = "test-key";

      execAbortableMock
        .mockResolvedValueOnce({ stdout: "/usr/local/bin/gemini", stderr: "" })
        .mockResolvedValueOnce({ stdout: "0.2.1", stderr: "" });

      const runtime = createGeminiRuntime();
      const health = await runtime.healthCheck();

      expect(health.authenticated).toBe("yes");
      expect(health.authDetail).toBe("env: GOOGLE_API_KEY");

      process.env.GEMINI_API_KEY = origGemini;
      process.env.GOOGLE_API_KEY = origGoogle;
    });
  });

  describe("kimi", () => {
    it("returns authenticated when MOONSHOT_API_KEY is set", async () => {
      const origKey = process.env.MOONSHOT_API_KEY;
      process.env.MOONSHOT_API_KEY = "test-key";

      execAbortableMock
        .mockResolvedValueOnce({ stdout: "/usr/local/bin/kimi", stderr: "" })
        .mockResolvedValueOnce({ stdout: "1.0.0", stderr: "" });

      const runtime = createKimiRuntime();
      const health = await runtime.healthCheck();

      expect(health.authenticated).toBe("yes");

      process.env.MOONSHOT_API_KEY = origKey;
    });
  });

  describe("coderabbit", () => {
    it("returns authenticated via cr auth status", async () => {
      execAbortableMock
        .mockResolvedValueOnce({ stdout: "/usr/local/bin/cr", stderr: "" })
        .mockResolvedValueOnce({ stdout: "2.1.0", stderr: "" })
        .mockResolvedValueOnce({ stdout: "Logged in", stderr: "" });

      const runtime = createCodeRabbitRuntime();
      const health = await runtime.healthCheck();

      expect(health.installed).toBe(true);
      expect(health.authenticated).toBe("yes");
    });
  });

  describe("opencode", () => {
    it("returns not installed when which fails", async () => {
      execAbortableMock.mockRejectedValue(new Error("not found"));

      const runtime = createOpenCodeRuntime();
      const health = await runtime.healthCheck();

      expect(health.installed).toBe(false);
    });
  });

  describe("pi", () => {
    it("returns not installed when which fails", async () => {
      execAbortableMock.mockRejectedValue(new Error("not found"));

      const runtime = createPiRuntime();
      const health = await runtime.healthCheck();

      expect(health.installed).toBe(false);
    });

    it("returns authenticated via auth.json", async () => {
      execAbortableMock
        .mockResolvedValueOnce({ stdout: "/usr/local/bin/pi", stderr: "" }) // which
        .mockResolvedValueOnce({ stdout: "0.5.0", stderr: "" }); // --version

      const existsSpy = vi.spyOn(fs, "existsSync").mockReturnValue(true);

      const runtime = createPiRuntime();
      const health = await runtime.healthCheck();

      expect(health.installed).toBe(true);
      expect(health.authenticated).toBe("yes");
      expect(health.authDetail).toBe("~/.pi/agent/auth.json");

      existsSpy.mockRestore();
    });

    it("falls back to env var when no auth.json", async () => {
      const origKey = process.env.ANTHROPIC_API_KEY;
      process.env.ANTHROPIC_API_KEY = "sk-test";

      execAbortableMock
        .mockResolvedValueOnce({ stdout: "/usr/local/bin/pi", stderr: "" }) // which
        .mockResolvedValueOnce({ stdout: "0.5.0", stderr: "" }); // --version

      const existsSpy = vi.spyOn(fs, "existsSync").mockReturnValue(false);

      const runtime = createPiRuntime();
      const health = await runtime.healthCheck();

      expect(health.authenticated).toBe("yes");
      expect(health.authDetail).toBe("env: API key detected");

      existsSpy.mockRestore();
      process.env.ANTHROPIC_API_KEY = origKey;
    });
  });

  describe("droid", () => {
    it("returns not installed when which fails", async () => {
      execAbortableMock.mockRejectedValue(new Error("not found"));

      const runtime = createDroidRuntime();
      const health = await runtime.healthCheck();

      expect(health.installed).toBe(false);
    });

    it("returns authenticated via auth.encrypted", async () => {
      execAbortableMock.mockResolvedValueOnce({ stdout: "/usr/local/bin/droid", stderr: "" }); // which

      const existsSpy = vi.spyOn(fs, "existsSync").mockReturnValue(true);

      const runtime = createDroidRuntime();
      const health = await runtime.healthCheck();

      expect(health.installed).toBe(true);
      expect(health.authenticated).toBe("yes");
      expect(health.authDetail).toBe("~/.factory/auth.encrypted");

      existsSpy.mockRestore();
    });

    it("returns no auth when auth.encrypted missing", async () => {
      execAbortableMock.mockResolvedValueOnce({ stdout: "/usr/local/bin/droid", stderr: "" }); // which

      const existsSpy = vi.spyOn(fs, "existsSync").mockReturnValue(false);

      const runtime = createDroidRuntime();
      const health = await runtime.healthCheck();

      expect(health.authenticated).toBe("no");

      existsSpy.mockRestore();
    });
  });

  describe("mastracode", () => {
    it("returns not installed when which fails", async () => {
      execAbortableMock.mockRejectedValue(new Error("not found"));

      const runtime = createMastraCodeRuntime();
      const health = await runtime.healthCheck();

      expect(health.installed).toBe(false);
    });

    it("returns authenticated via ANTHROPIC_API_KEY", async () => {
      const origKey = process.env.ANTHROPIC_API_KEY;
      process.env.ANTHROPIC_API_KEY = "sk-test";

      execAbortableMock.mockResolvedValueOnce({ stdout: "/usr/local/bin/mastracode", stderr: "" }); // which

      const runtime = createMastraCodeRuntime();
      const health = await runtime.healthCheck();

      expect(health.installed).toBe(true);
      expect(health.authenticated).toBe("yes");
      expect(health.authDetail).toBe("env: ANTHROPIC_API_KEY");

      process.env.ANTHROPIC_API_KEY = origKey;
    });

    it("returns authenticated via OPENAI_API_KEY", async () => {
      const origAnthro = process.env.ANTHROPIC_API_KEY;
      const origOpenai = process.env.OPENAI_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      process.env.OPENAI_API_KEY = "sk-test";

      execAbortableMock.mockResolvedValueOnce({ stdout: "/usr/local/bin/mastracode", stderr: "" }); // which

      const runtime = createMastraCodeRuntime();
      const health = await runtime.healthCheck();

      expect(health.authenticated).toBe("yes");
      expect(health.authDetail).toBe("env: OPENAI_API_KEY");

      process.env.ANTHROPIC_API_KEY = origAnthro;
      process.env.OPENAI_API_KEY = origOpenai;
    });

    it("returns not yes when no env vars set", async () => {
      const origAnthro = process.env.ANTHROPIC_API_KEY;
      const origOpenai = process.env.OPENAI_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;

      execAbortableMock.mockResolvedValueOnce({ stdout: "/usr/local/bin/mastracode", stderr: "" }); // which

      const runtime = createMastraCodeRuntime();
      const health = await runtime.healthCheck();

      // Without env vars, auth is either "no" or "unknown" (if ~/.mastracode dir exists)
      expect(health.authenticated).not.toBe("yes");

      process.env.ANTHROPIC_API_KEY = origAnthro;
      process.env.OPENAI_API_KEY = origOpenai;
    });
  });

  describe("copilot", () => {
    it("returns not installed when gh is not found", async () => {
      execAbortableMock.mockRejectedValue(new Error("not found"));

      const runtime = createCopilotRuntime();
      const health = await runtime.healthCheck();

      expect(health.installed).toBe(false);
    });

    it("returns not installed when copilot CLI is not available", async () => {
      execAbortableMock
        .mockResolvedValueOnce({ stdout: "/opt/homebrew/bin/gh", stderr: "" }) // which gh
        .mockRejectedValueOnce(new Error("copilot not found")); // gh copilot -- --version

      const runtime = createCopilotRuntime();
      const health = await runtime.healthCheck();

      expect(health.installed).toBe(false);
    });

    it("returns authenticated via GH_TOKEN", async () => {
      const origToken = process.env.GH_TOKEN;
      process.env.GH_TOKEN = "ghp_test123";

      execAbortableMock
        .mockResolvedValueOnce({ stdout: "/opt/homebrew/bin/gh", stderr: "" }) // which
        .mockResolvedValueOnce({ stdout: "GitHub Copilot CLI 1.0.22", stderr: "" }); // --version

      const runtime = createCopilotRuntime();
      const health = await runtime.healthCheck();

      expect(health.installed).toBe(true);
      expect(health.version).toBe("1.0.22");
      expect(health.authenticated).toBe("yes");
      expect(health.authDetail).toBe("env: GH_TOKEN");

      process.env.GH_TOKEN = origToken;
    });

    it("returns authenticated via gh auth status", async () => {
      const origCopilot = process.env.COPILOT_GITHUB_TOKEN;
      const origGH = process.env.GH_TOKEN;
      const origGithub = process.env.GITHUB_TOKEN;
      delete process.env.COPILOT_GITHUB_TOKEN;
      delete process.env.GH_TOKEN;
      delete process.env.GITHUB_TOKEN;

      execAbortableMock
        .mockResolvedValueOnce({ stdout: "/opt/homebrew/bin/gh", stderr: "" }) // which
        .mockResolvedValueOnce({ stdout: "GitHub Copilot CLI 1.0.22", stderr: "" }) // --version
        .mockResolvedValueOnce({ stdout: "", stderr: "Logged in to github.com account user" }); // gh auth status

      const runtime = createCopilotRuntime();
      const health = await runtime.healthCheck();

      expect(health.authenticated).toBe("yes");
      expect(health.authDetail).toBe("gh auth");

      process.env.COPILOT_GITHUB_TOKEN = origCopilot;
      process.env.GH_TOKEN = origGH;
      process.env.GITHUB_TOKEN = origGithub;
    });
  });
});
