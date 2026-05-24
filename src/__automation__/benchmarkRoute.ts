// Deep-link protocol surface for the E2E benchmark runner. Owns the URL
// prefix, the prefix matcher, and the autostart query parser — i.e. every
// shape-bound piece of the `pocketpal://e2e/benchmark[...]` contract.
//
// Lives under src/__automation__/ so the automation protocol stays inside
// the same boundary as the runner screen and the dispatch helpers. The two
// allow-listed prod-reachable mount points (App.tsx and src/hooks/
// useDeepLinking.ts; see the no-restricted-imports allow-list in .eslintrc)
// are the only places outside this folder that may import from here.
//
// Pure module: no side effects, no logging, no navigation. The helpers
// never throw — malformed inputs yield `false`. This keeps the import safe
// even if a future call site lands outside an `__E2E__` branch.

// Canonical deep-link URL that routes to the benchmark runner screen.
// Used by both the useDeepLinking warm/cold-launch Linking effect (raw-URL
// match) and the dispatchAutomationDeepLink router (DeepLinkParams match).
export const BENCHMARK_RUNNER_URL_PREFIX = 'pocketpal://e2e/benchmark';

export function isBenchmarkRunnerUrl(url: string | null | undefined): boolean {
  return typeof url === 'string' && url.startsWith(BENCHMARK_RUNNER_URL_PREFIX);
}

// Resolve the autostart signal from a bench deep-link URL. Returns true iff
// the URL carries `?autostart=` with a value of exactly "1" or "true"
// (case-insensitive); any other value, or absence, is false. The narrow
// allowlist avoids an "autostart=0 still starts" foot-gun and keeps the
// contract trivially scriptable from adb / WDIO.
//
// This is the SINGLE place the truthiness rule lives — both deep-link
// delivery sites call it, so the two routing paths cannot drift. It is NOT
// the routing gate: isBenchmarkRunnerUrl stays the sole matcher; this
// helper is consulted only once a URL has already matched.
//
// Parses the query substring directly rather than relying on host parsing
// of the custom scheme.
export function parseBenchmarkAutostart(
  url: string | null | undefined,
): boolean {
  if (typeof url !== 'string') {
    return false;
  }
  try {
    const queryIndex = url.indexOf('?');
    if (queryIndex === -1) {
      return false;
    }
    const params = new URLSearchParams(url.slice(queryIndex + 1));
    const value = params.get('autostart');
    if (value === null) {
      return false;
    }
    const normalized = value.toLowerCase();
    return normalized === '1' || normalized === 'true';
  } catch {
    return false;
  }
}
