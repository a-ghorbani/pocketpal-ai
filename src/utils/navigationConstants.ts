// Navigation route names
export const ROUTES = {
  // Main app routes
  CHAT: 'Chat',
  MODELS: 'Models',
  PALS: 'Pals (experimental)',
  BENCHMARK: 'Benchmark',
  SETTINGS: 'Settings',
  APP_INFO: 'App Info',

  // Dev tools route. Only available in debug mode.
  DEV_TOOLS: 'Dev Tools',

  // E2E-only deep-link-driven matrix runner. Hidden from drawer sidebar via
  // drawerItemStyle:{display:'none'}; reachable only by the deep link
  // pocketpal://e2e/benchmark in the e2e flavor build.
  BENCHMARK_RUNNER: 'BenchmarkRunner',
};

// Canonical deep-link URL that routes to BENCHMARK_RUNNER. Used by both the
// useDeepLinking warm/cold-launch effect (raw-URL match) and the
// dispatchAutomationDeepLink router (DeepLinkParams match).
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
// delivery sites (the useDeepLinking cold/warm-launch Linking effect and the
// dispatchAutomationDeepLink router) call it, so the two routing paths cannot
// drift. It is NOT the routing gate: isBenchmarkRunnerUrl stays the sole
// matcher; this helper is consulted only once a URL has already matched.
//
// Pure and side-effect-free: it does not navigate, mutate state, log, or
// throw (a malformed URL yields false). Parses the query substring directly
// rather than relying on host parsing of the custom scheme, so it ships
// harmlessly in prod even though navigationConstants.ts is prod-reachable —
// it introduces no new automation marker string.
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
