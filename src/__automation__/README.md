# `src/__automation__/` — E2E Automation Bridge

Single home for all code that exists ONLY to support E2E automation
(Appium/WebDriverIO specs). Every file in this folder MUST be
dead-code-eliminated from the production bundle.

## Build-time contract

The folder is gated behind the `__E2E__` global, inlined at build time by
`babel-plugin-transform-define`:

- `E2E_BUILD=true` in the build env → `__E2E__ = true` → everything here ships.
- Everything else (default dev + prod) → `__E2E__ = false` → Metro/Hermes
  strips the entire gate body (and, transitively, the imports it reaches).

The Android `e2e` flavor (`applicationId com.pocketpalai.e2e`,
buildType `releaseE2e`) is the production-like build that sets
`E2E_BUILD=true`. The default prod flavor (`com.pocketpalai`) leaves
`E2E_BUILD` unset.

Two independent guardrails enforce the contract:

1. **ESLint `no-restricted-imports`** — in `.eslintrc.js`, files outside
   this folder may not import from `src/__automation__/...` EXCEPT for
   the allow-listed entry points (`App.tsx`, `src/hooks/useDeepLinking.ts`).
2. **CI bundle-grep** — in `.github/workflows/ci.yml`, the `build-android`
   job extracts `assets/index.android.bundle` from the prod APK and fails
   the build if any of the automation marker strings
   (`AUTOMATION_BRIDGE`, `memory-snapshot-label`, `memory-snapshot-result`,
   `BENCH_RUN_MATRIX`, `bench-runner-screen-status`) appear. The ground
   truth for DCE.

> **Note on the static-import question.** Some readers worry that `App.tsx`
> statically importing from `./src/__automation__/index.ts` (e.g. for
> `<AutomationBridge />` and the deep-link Drawer screen) leaks the entire
> automation module graph into the prod bundle, since ES imports enter the
> Metro graph regardless of whether the JSX render sites are reachable.
>
> The DCE contract here does NOT rest on import-site purity. It rests on the
> **bundle-grep gate** in `.github/workflows/ci.yml` (the
> `Verify prod APK has no automation-bridge code` step at lines 202-233).
> That step extracts `assets/index.android.bundle` from the prod APK and
> fails the build if any of the registered marker strings
> (`AUTOMATION_BRIDGE`, `memory-snapshot-label`, `memory-snapshot-result`,
> `BENCH_RUN_MATRIX`, `bench-runner-screen-status`) appear. Hermes'
> constant-folding + tree-shaking on `__E2E__ === false` is what actually
> removes the code; the grep is the empirical contract that proves it for
> every prod build.
>
> When adding a new automation surface, register a new marker (a literal
> string referenced from inside the runtime code, never just JSDoc — Hermes
> can DCE pure-comment literals) and add it to the markers list in `ci.yml`.
> Then trust the gate, not the import site.

## Adding a new adapter

1. Create `src/__automation__/adapters/FooAdapter.tsx` — a functional
   component that renders a hidden, accessibility-tree-friendly surface
   (see `MemoryAdapter.tsx` as reference). Hidden adapters are appropriate
   when the spec needs to instrument the regular UX flow at lifecycle
   moments (memory profiling is the canonical case).
2. Render the adapter inside `AutomationBridge.tsx`:
   ```tsx
   <>
     <MemoryAdapter />
     <FooAdapter />
   </>
   ```
3. Add a test at `adapters/__tests__/FooAdapter.test.tsx` that covers the
   command protocol and the testID contract.
4. Update the CI bundle-grep markers in `.github/workflows/ci.yml` if
   your adapter introduces new protocol strings.

For tasks that are synthetic harnesses (don't need to instrument the
real UX flow), prefer adding a dedicated screen under `screens/` —
mounted as an `__E2E__`-gated `Drawer.Screen` in `App.tsx` and reachable
by deep link only. See `BenchmarkRunnerScreen.tsx` as reference.

## Current adapters

| Adapter | Purpose | Commands |
|---------|---------|----------|
| `MemoryAdapter` | Memory profile snapshots for the `memory-profile` spec | `snap::<label>`, `clear::snapshots`, `read::snapshots` |

## Screens

| Screen | Purpose | Activation |
|--------|---------|------------|
| `BenchmarkRunnerScreen` | Drives the benchmark matrix in-app for the `benchmark-matrix` spec | Deep link `pocketpal://e2e/benchmark` (registered in `android/app/src/e2e/AndroidManifest.xml`); manual button tap to start |

## Deep-link dispatcher

`src/__automation__/deepLink.ts` exports `dispatchAutomationDeepLink`,
used by `src/hooks/useDeepLinking.ts` inside a `__E2E__` gate. Today it
handles two hosts:

- `memory` — `pocketpal://memory?cmd=snap::<label>` etc. (memory-profile spec)
- `e2e/benchmark` — navigates to `BenchmarkRunnerScreen` (benchmark-matrix spec).
  On Android, the cold-launch path also lives in `useDeepLinking.ts`
  itself (a `__E2E__`-gated `Linking.getInitialURL()` effect) since RN's
  Android side has no equivalent of the iOS `RCTOpenURLNotification`
  listener wired through `DeepLinkService`.

Add new deep-link hosts here when they're E2E-only.

## Marker

`AutomationBridge.tsx` contains the literal string `AUTOMATION_BRIDGE`
in its JSDoc so the CI grep has something to match against. If you rename
the component, update the grep markers in `.github/workflows/ci.yml`.
