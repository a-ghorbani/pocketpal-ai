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
  // pocketpal://e2e/benchmark in the e2e flavor build. The URL prefix,
  // matcher, and autostart parser live in src/__automation__/benchmarkRoute
  // so the automation protocol stays inside the __automation__ boundary.
  BENCHMARK_RUNNER: 'BenchmarkRunner',

  // Onboarding stack routes (mounted via OnboardingStack when
  // uiStore.hasCompletedOnboarding is false; see App.tsx SwitchPoint).
  ONBOARDING: {
    SPLASH: 'OnboardingSplash',
    STEP_1: 'Onboarding1',
    STEP_2: 'Onboarding2',
    STEP_3: 'Onboarding3',
    STEP_4: 'Onboarding4',
    STEP_5: 'Onboarding5',
    STEP_6: 'Onboarding6',
  } as const,
} as const;
