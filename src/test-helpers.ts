import type { RuntimeExecutionRequest } from "./types.js"

export function buildRequest(overrides: Partial<RuntimeExecutionRequest> = {}): RuntimeExecutionRequest {
  return {
    taskName: "Reviewer",
    model: "default",
    prompt: "Prompt",
    promptFile: "/tmp/prompt.txt",
    outputFormat: '{"issues":[]}',
    ...overrides,
  }
}
