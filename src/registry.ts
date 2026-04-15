import type { RuntimeAdapter } from "./types.js";
import * as adapters from "./adapters/index.js";

/**
 * Auto-discovered runtime registry.
 *
 * Adding a new adapter file to adapters/ and re-exporting it from
 * adapters/index.ts automatically registers it here — no other
 * changes needed. It will appear in doctor, schema validation,
 * contract tests, and smoke tests.
 */
const runtimes = new Map<string, () => RuntimeAdapter>(
  Object.entries(adapters).map(([name, factory]) => [name, factory as () => RuntimeAdapter]),
);

export function getRuntime(name: string): RuntimeAdapter {
  const factory = runtimes.get(name);
  if (!factory) {
    const available = [...runtimes.keys()].join(", ");
    throw new Error(`Unknown runtime: "${name}". Available: ${available}`);
  }
  return factory();
}

export function getAllRuntimes(): RuntimeAdapter[] {
  return [...runtimes.entries()].map(([, factory]) => factory());
}

export function getRuntimeNames(): string[] {
  return [...runtimes.keys()];
}
