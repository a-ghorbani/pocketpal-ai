/**
 * Injected into `HttpToolEngine` so the engine never imports a store — the
 * `searchAccess` pattern. This file stays interface-only: the engine takes it
 * with `import type`, which Babel erases, so nothing from `src/store/` can
 * reach the engine's require tree. The factory lives in `services/talents`.
 */
export interface CustomToolAccess {
  /** Read per call, never cached in the engine. */
  getSecrets(toolId: string): Promise<Record<string, string>>;
}
