/**
 * Auto-discovery barrel for runtime adapters.
 *
 * To add a new runtime, create a file in this directory that exports:
 *   export function create<Name>Runtime(): RuntimeAdapter { ... }
 *   export const createAdapter = create<Name>Runtime
 *
 * Then add it to the exports below. The registry picks it up automatically.
 */
export { createAdapter as claude } from "./claude.js"
export { createAdapter as codex } from "./codex.js"
export { createAdapter as gemini } from "./gemini.js"
export { createAdapter as kimi } from "./kimi.js"
export { createAdapter as coderabbit } from "./coderabbit.js"
export { createAdapter as opencode } from "./opencode.js"
export { createAdapter as pi } from "./pi.js"
export { createAdapter as droid } from "./droid.js"
export { createAdapter as mastracode } from "./mastracode.js"
export { createAdapter as copilot } from "./copilot.js"
