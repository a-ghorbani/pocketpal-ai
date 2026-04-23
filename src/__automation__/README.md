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
   the build if any of the automation command strings
   (`AUTOMATION_BRIDGE`, `read::latest`, `list::models`,
   `memory-snapshot-label`, etc.) appear. The ground truth for DCE.

## Adding a new adapter

1. Create `src/__automation__/adapters/FooAdapter.tsx` — a functional
   component that renders a hidden, accessibility-tree-friendly surface
   (see `MemoryAdapter.tsx` / `BenchmarkAdapter.tsx` as reference).
2. Render the adapter inside `AutomationBridge.tsx`:
   ```tsx
   <>
     <MemoryAdapter />
     <BenchmarkAdapter />
     <FooAdapter />
   </>
   ```
3. Add a test at `adapters/__tests__/FooAdapter.test.tsx` that covers the
   command protocol and the testID contract.
4. Update the CI bundle-grep markers in `.github/workflows/ci.yml` if
   your adapter introduces new protocol strings.

## Current adapters

| Adapter | Purpose | Commands |
|---------|---------|----------|
| `MemoryAdapter` | Memory profile snapshots for the `memory-profile` spec | `snap::<label>`, `clear::snapshots`, `read::snapshots` |
| `BenchmarkAdapter` | Benchmark result / init settings / model list for `benchmark-matrix` | `read::latest`, `read::initSettings`, `list::models` |

## Deep-link dispatcher

`src/__automation__/deepLink.ts` exports `dispatchAutomationDeepLink`,
used by `src/hooks/useDeepLinking.ts` inside a `__E2E__` gate. Today it
handles `pocketpal://memory?cmd=…`. Add new deep-link hosts here when
they're E2E-only.

## Marker

`AutomationBridge.tsx` contains the literal string `AUTOMATION_BRIDGE`
in its JSDoc so the CI grep has something to match against. If you rename
the component, update the grep markers in `.github/workflows/ci.yml`.
