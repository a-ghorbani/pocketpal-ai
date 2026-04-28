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
