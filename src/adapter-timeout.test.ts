import { beforeEach, describe, expect, it, vi } from "vitest";
import { EXEC_DEFAULTS, resolveTimeout } from "./adapter-base.js";
import { createClaudeRuntime } from "./adapters/claude.js";
import { createCodeRabbitRuntime } from "./adapters/coderabbit.js";
import { createOpenCodeRuntime } from "./adapters/opencode.js";
import { createPiRuntime } from "./adapters/pi.js";
import { buildRequest } from "./tests/test-helpers.js";

const { execAbortableMock } = vi.hoisted(() => ({
  execAbortableMock: vi.fn(),
}));

vi.mock("./exec.js", () => ({
  execAbortable: execAbortableMock,
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, readFileSync: vi.fn(() => "Prompt") };
});

const HALF_HOUR = 30 * 60 * 1000;

function timeoutOfLastCall(): number | undefined {
  const call = execAbortableMock.mock.calls.at(-1);
  return (call?.[2] as { timeout?: number } | undefined)?.timeout;
}

describe("resolveTimeout", () => {
  it("falls back to the shared default when nobody asks for anything", () => {
    expect(resolveTimeout({})).toBe(EXEC_DEFAULTS.defaultTimeout);
  });

  it("prefers an adapter's own default over the shared one", () => {
    expect(resolveTimeout({}, HALF_HOUR)).toBe(HALF_HOUR);
  });

  it("lets the request win over both, because only the caller knows the job size", () => {
    expect(resolveTimeout({ timeoutMs: 1000 }, HALF_HOUR)).toBe(1000);
  });
});

describe("timeoutMs reaches every execution path", () => {
  beforeEach(() => {
    execAbortableMock.mockReset();
    execAbortableMock.mockResolvedValue({ stdout: "ok", stderr: "" });
  });

  it("runCommand — claude", async () => {
    await createClaudeRuntime().execute(buildRequest({ timeoutMs: HALF_HOUR }));
    expect(timeoutOfLastCall()).toBe(HALF_HOUR);
  });

  it("executeViaStdin — pi", async () => {
    await createPiRuntime().execute(buildRequest({ timeoutMs: HALF_HOUR }));
    expect(timeoutOfLastCall()).toBe(HALF_HOUR);
  });

  it("runExpectCommand — opencode", async () => {
    await createOpenCodeRuntime().execute(buildRequest({ timeoutMs: HALF_HOUR }));
    expect(timeoutOfLastCall()).toBe(HALF_HOUR);
  });

  it("overrides an adapter that hardcodes its own wall", async () => {
    await createCodeRabbitRuntime().execute(buildRequest({ timeoutMs: HALF_HOUR }));
    expect(timeoutOfLastCall()).toBe(HALF_HOUR);
  });

  it("leaves that adapter's wall alone when the request says nothing", async () => {
    await createCodeRabbitRuntime().execute(buildRequest());
    expect(timeoutOfLastCall()).toBe(45 * 60 * 1000);
  });

  it("keeps the shared default for everyone else", async () => {
    await createClaudeRuntime().execute(buildRequest());
    expect(timeoutOfLastCall()).toBe(EXEC_DEFAULTS.defaultTimeout);
  });
});

describe("the expect script gets the same wall", () => {
  beforeEach(() => {
    execAbortableMock.mockReset();
    execAbortableMock.mockResolvedValue({ stdout: "ok", stderr: "" });
  });

  it("writes the timeout in seconds, not milliseconds", async () => {
    await createOpenCodeRuntime().execute(buildRequest({ timeoutMs: HALF_HOUR }));
    const script = execAbortableMock.mock.calls.at(-1)?.[1]?.[1] as string;
    expect(script).toContain(`set timeout ${HALF_HOUR / 1000}`);
  });
});
