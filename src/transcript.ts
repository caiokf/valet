import fs from "node:fs";
import type { Transcript, TranscriptBlock, TranscriptMessage, TranscriptRole } from "./types.js";

/**
 * Shared machinery for turning a CLI's own session log into the common
 * transcript shape. The per-runtime schemas live with their adapters; what is
 * here is the part every one of them needs — reading JSONL that may have been
 * truncated mid-write, and describing tool calls consistently.
 */

/** Parse a JSONL session file, tolerating a final partial line. */
export function readJsonl(file: string): Record<string, unknown>[] {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf-8");
  } catch {
    return [];
  }

  const records: Record<string, unknown>[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed: unknown = JSON.parse(line);
      // A session killed mid-write ends in a partial line; skipping it is
      // better than losing every message before it.
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        records.push(parsed as Record<string, unknown>);
      }
    } catch {
      // Not JSON; the line is unusable either way.
    }
  }
  return records;
}

/**
 * A one-line stand-in for a tool call, so a collapsed block still says what it
 * did. The first meaningful argument beats printing the whole payload.
 */
export function summariseTool(input: Record<string, unknown>): string {
  const pick = (...keys: string[]): string | undefined => {
    for (const key of keys) {
      const value = input[key];
      if (typeof value === "string" && value.length > 0) return value;
    }
    return undefined;
  };

  return (
    pick("command", "cmd") ??
    pick("file_path", "filePath", "path") ??
    pick("pattern", "query", "url", "prompt", "description") ??
    (Object.values(input).find((v) => typeof v === "string") as string | undefined) ??
    ""
  );
}

/**
 * An edit block when the tool call carries its own before/after. A write is an
 * edit from nothing, which renders as an all-additions diff.
 */
export function editFromToolInput(
  name: string,
  input: Record<string, unknown>,
): TranscriptBlock | null {
  const path = firstString(input, "file_path", "filePath", "path");
  if (!path) return null;

  const before = firstString(input, "old_string", "oldString", "old_text", "oldText");
  const after = firstString(input, "new_string", "newString", "new_text", "newText");
  if (before !== undefined && after !== undefined) {
    return { kind: "edit", path, before, after };
  }

  const content = firstString(input, "content", "text");
  if (content !== undefined && /write|create/i.test(name)) {
    return { kind: "edit", path, before: "", after: content };
  }

  return null;
}

/** Tool results arrive as a string, a content-block array, or a wrapper. */
export function flattenText(value: unknown): string {
  if (typeof value === "string") return value;

  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === "string") return entry;
        const block = asRecord(entry);
        return block && typeof block.text === "string" ? block.text : "";
      })
      .filter(Boolean)
      .join("\n");
  }

  const record = asRecord(value);
  if (record) {
    if (typeof record.text === "string") return record.text;
    if (typeof record.output === "string") return record.output;
    if (typeof record.stdout === "string") return record.stdout;
  }
  return "";
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function firstString(
  source: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string") return value;
  }
  return undefined;
}

/** A message is a tool turn when every block in it is a result. */
export function roleFor(fallback: TranscriptRole, blocks: TranscriptBlock[]): TranscriptRole {
  return blocks.length > 0 && blocks.every((b) => b.kind === "tool_result") ? "tool" : fallback;
}

export function buildTranscript(
  runtime: string,
  messages: TranscriptMessage[],
  model?: string,
): Transcript {
  return model ? { runtime, model, messages } : { runtime, messages };
}
