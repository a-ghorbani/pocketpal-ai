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
