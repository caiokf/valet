import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { encodeProjectDir, parseClaudeSession } from "./adapters/claude.js";
import { parsePiSession } from "./adapters/pi.js";
import { editFromToolInput, flattenText, readJsonl, summariseTool } from "./transcript.js";

/**
 * The fixtures below are trimmed from sessions the real CLIs wrote, so a schema
 * change upstream shows up here rather than as an empty transcript in a UI.
 */

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "valet-transcript-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

/** Parsing is expected to succeed in these fixtures; fail loudly if it does not. */
function parsed<T>(value: T | null, what: string): T {
  if (value === null) throw new Error(`expected ${what} to parse`);
  return value;
}

function write(name: string, lines: unknown[]): string {
  const file = path.join(dir, name);
  fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join("\n"), "utf-8");
  return file;
}

// ── pi ─────────────────────────────────────────────────────────

const PI_SESSION = [
  { type: "session", version: 3, id: "019f", timestamp: "2026-08-06T06:11:12.000Z", cwd: "/tmp" },
  {
    type: "model_change",
    id: "a",
    timestamp: "…",
    provider: "opencode-go",
    modelId: "deepseek-v4-pro",
  },
  {
    type: "message",
    id: "m1",
    timestamp: "2026-08-06T06:11:12.880Z",
    message: { role: "user", content: [{ type: "text", text: "write vt.txt" }] },
  },
  {
    type: "message",
    id: "m2",
    timestamp: "2026-08-06T06:11:17.341Z",
    message: {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "I should write the file." },
        {
          type: "toolCall",
          id: "call_1",
          name: "write",
          arguments: { path: "/tmp/vt.txt", content: "hi" },
        },
      ],
    },
  },
  {
    type: "message",
    id: "m3",
    timestamp: "2026-08-06T06:11:17.418Z",
    message: {
      role: "toolResult",
      toolCallId: "call_1",
      toolName: "write",
      content: [{ type: "text", text: "Successfully wrote 2 bytes" }],
      isError: false,
    },
  },
];

describe("parsePiSession", () => {
  it("reads role and content from the nested message, not the envelope", () => {
    const transcript = parsed(parsePiSession(write("pi.jsonl", PI_SESSION)), "pi session");

    expect(transcript.runtime).toBe("pi");
    expect(transcript.model).toBe("opencode-go/deepseek-v4-pro");
    expect(transcript.messages.map((m) => m.role)).toEqual(["user", "assistant", "tool"]);
  });

  it("carries the tool call id from the message onto its result block", () => {
    const transcript = parsed(parsePiSession(write("pi.jsonl", PI_SESSION)), "pi session");
    const result = transcript.messages[2].blocks[0];

    expect(result).toMatchObject({ kind: "tool_result", toolUseId: "call_1", ok: true });
  });

  it("derives an edit block from a write, so the caller can draw a diff", () => {
    const transcript = parsed(parsePiSession(write("pi.jsonl", PI_SESSION)), "pi session");
    const blocks = transcript.messages[1].blocks;

    expect(blocks.map((b) => b.kind)).toEqual(["thinking", "tool_use", "edit"]);
    expect(blocks[2]).toEqual({ kind: "edit", path: "/tmp/vt.txt", before: "", after: "hi" });
  });

  it("marks a failed tool result", () => {
    const failed = [
      PI_SESSION[0],
      {
        type: "message",
        id: "m1",
        message: {
          role: "toolResult",
          toolCallId: "c",
          content: [{ type: "text", text: "boom" }],
          isError: true,
        },
      },
    ];
    const transcript = parsed(parsePiSession(write("fail.jsonl", failed)), "pi session");

    expect(transcript.messages[0].blocks[0]).toMatchObject({ kind: "tool_result", ok: false });
  });

  it("returns null for a session with no events", () => {
    expect(parsePiSession(write("empty.jsonl", []))).toBeNull();
  });
});

// ── claude ─────────────────────────────────────────────────────

const CLAUDE_SESSION = [
  { type: "attachment", uuid: "skip-me" },
  {
    type: "user",
    uuid: "u1",
    timestamp: "2026-08-06T06:00:00.000Z",
    message: { role: "user", content: [{ type: "text", text: "make calc.py" }] },
  },
  {
    type: "assistant",
    uuid: "a1",
    timestamp: "2026-08-06T06:00:02.000Z",
    message: {
      role: "assistant",
      model: "claude-haiku-4-5-20251001",
      content: [
        { type: "thinking", thinking: "Write it first." },
        {
          type: "tool_use",
          id: "toolu_1",
          name: "Edit",
          input: {
            file_path: "/tmp/calc.py",
            old_string: "def add(a,b):",
            new_string: "def add(a, b):",
          },
        },
      ],
    },
  },
  {
    type: "user",
    uuid: "u2",
    message: {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "applied" }],
    },
  },
];

describe("parseClaudeSession", () => {
  it("skips bookkeeping entries and keeps the conversation", () => {
    const transcript = parsed(
      parseClaudeSession(write("c.jsonl", CLAUDE_SESSION)),
      "claude session",
    );

    expect(transcript.runtime).toBe("claude");
    expect(transcript.model).toBe("claude-haiku-4-5-20251001");
    expect(transcript.messages.map((m) => m.id)).toEqual(["u1", "a1", "u2"]);
  });

  it("classifies a message of only tool results as a tool turn", () => {
    const transcript = parsed(
      parseClaudeSession(write("c.jsonl", CLAUDE_SESSION)),
      "claude session",
    );
    expect(transcript.messages[2].role).toBe("tool");
  });

  it("derives an edit block with both sides from an Edit call", () => {
    const transcript = parsed(
      parseClaudeSession(write("c.jsonl", CLAUDE_SESSION)),
      "claude session",
    );
    const blocks = transcript.messages[1].blocks;

    expect(blocks.map((b) => b.kind)).toEqual(["thinking", "tool_use", "edit"]);
    expect(blocks[2]).toEqual({
      kind: "edit",
      path: "/tmp/calc.py",
      before: "def add(a,b):",
      after: "def add(a, b):",
    });
  });

  it("survives a session truncated mid-line", () => {
    const file = path.join(dir, "torn.jsonl");
    fs.writeFileSync(
      file,
      `${JSON.stringify(CLAUDE_SESSION[1])}\n{"type":"assistant","message":{"content":[{"type":"te`,
      "utf-8",
    );

    const transcript = parsed(parseClaudeSession(file), "torn session");
    expect(transcript.messages).toHaveLength(1);
  });

  it("encodes a project directory the way claude names it", () => {
    expect(encodeProjectDir("/Users/me/work")).toBe("-Users-me-work");
  });
});

// ── shared shaping ─────────────────────────────────────────────

describe("summariseTool", () => {
  it.each([
    [{ command: "ls -la", description: "list" }, "ls -la"],
    [{ file_path: "/tmp/a.ts" }, "/tmp/a.ts"],
    [{ path: "/tmp/b.ts", content: "x" }, "/tmp/b.ts"],
    [{ pattern: "TODO" }, "TODO"],
    [{ limit: 5 }, ""],
  ])("summarises %j", (input, expected) => {
    expect(summariseTool(input)).toBe(expected);
  });

  it("prefers the command over the path, since that is what was run", () => {
    expect(summariseTool({ file_path: "/tmp/a", command: "cat /tmp/a" })).toBe("cat /tmp/a");
  });
});

describe("editFromToolInput", () => {
  it("ignores a tool call with no file", () => {
    expect(editFromToolInput("Bash", { command: "ls" })).toBeNull();
  });

  it("treats a read as no edit, even though it names a file", () => {
    expect(editFromToolInput("Read", { file_path: "/tmp/a" })).toBeNull();
  });

  it("treats content on a write as an all-additions edit", () => {
    expect(editFromToolInput("Write", { file_path: "/tmp/a", content: "hi" })).toEqual({
      kind: "edit",
      path: "/tmp/a",
      before: "",
      after: "hi",
    });
  });
});

describe("flattenText", () => {
  it.each([
    ["plain", "plain"],
    [
      [
        { type: "text", text: "a" },
        { type: "text", text: "b" },
      ],
      "a\nb",
    ],
    [{ stdout: "out" }, "out"],
    [42, ""],
  ])("flattens %j", (input, expected) => {
    expect(flattenText(input)).toBe(expected);
  });
});

describe("readJsonl", () => {
  it("returns nothing for a file that is not there", () => {
    expect(readJsonl(path.join(dir, "absent.jsonl"))).toEqual([]);
  });
});
