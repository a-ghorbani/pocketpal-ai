# 005: Merge upstream `4ebab32` into the current fork

**Status:** Accepted

## Revisions

- Merge base: `6cf3944a47a196d2a68b1ba05d2534bd0ec20dd5`
- Fork tip: `cc4da538a4c202b3ed0d70e7e6ad4fb0701eb365`
- Upstream tip: `4ebab32771df7d9e2554cd88a376bbda7d833da1`

The incoming range adds version-gated device rules, preserves user deletion or
renaming of built-in Pals, pins the Android ONNX Runtime artifact, upgrades
`llama.rn`, updates translations and the app release version, and adds an iOS
device benchmark driver.

## Fork requirements and history

All permanent invariants in
[001](001-sync-upstream-6cf3944.md#permanent-fork-invariants) remain in force.
The later hands-free cue, startup-selection, and content-safe diagnostics
decisions in [002](002-hands-free-turn-cues.md),
[003](003-startup-selection-restoration.md), and
[004](004-content-safe-protocol-errors.md) also remain in force.

The shared Pal-store resolution additionally preserves Scout, its talents,
warm-palette migration, custom settings, and startup-selection behavior from
`35f7dbc`, `9cf514a`, and `b3a42b1`.

## Affected paths

- `src/store/PalStore.ts`
- `src/store/__tests__/PalStore.test.ts`
- `src/store/ModelStore.ts`
- `src/store/__tests__/ModelStore.test.ts`
- device-rule sources, bundled rules, and tests
- Android and iOS native build configuration
- benchmark automation and documentation
- dependency manifests, lockfile, locales, and release metadata

## Resolution

Accept the upstream device-rule, native dependency, `llama.rn`, release,
translation, and iOS benchmark changes. Keep the fork's manually registered
on-device speech package, disabled centralized-integration configuration,
remote transports, startup restoration, Scout behavior, search behavior, and
E2E protocol coverage.

Apply upstream's seed-once persistence to all three built-in Pals: Lookie, Pip,
and Scout. Each built-in receives an independent AsyncStorage marker only after
an existing record is recognized or creation succeeds. This preserves later
deletion and renaming while allowing failed writes to retry. For an existing
Scout, the one-time path still performs the approved original-to-warm palette
migration without rewriting other user-authored settings.

## Rejected alternatives and risks

- Taking the upstream Pal store or tests wholesale would remove Scout.
- Keeping the fork Pal store unchanged would recreate deleted or renamed
  built-ins on later launches.
- Sharing one marker across all built-ins would prevent future defaults from
  being introduced independently.
- Replacing native or package files wholesale would remove fork speech,
  integration-disablement, and E2E behavior.

The seed markers cannot distinguish a built-in deleted before this release from
one never seeded, so an older deletion may be recreated once when its marker is
first introduced. This matches the upstream migration boundary.

## Preservation checks and validation status

Passed locally:

- all 17 incoming/conflict-focused suites (851 tests), including PalStore,
  ModelStore, device rules, native payload contracts, and benchmark tooling;
- 22 fork-preservation suites (419 tests) covering Responses, content-safe
  errors, startup selection, hands-free speech and TTS, search, persistence,
  and native contracts;
- the full Jest inventory at 306 passing suites, 5,137 passing tests, 6 skipped
  tests, and 310 passing snapshots;
- disabled-build tests, root type checking, localization validation, affected
  ESLint, resolved-file Prettier, deterministic Responses fixtures and their
  focused type check, React Native disabled-autolinking inspection, and
  `git diff --check`.

The full Jest command still exits nonzero after all suites pass because
`__tests__/App.test.tsx` leaves the pre-existing fetched-rules task running
after Jest teardown. The same isolated test and teardown error reproduce at
the fork tip `cc4da53`. Full ESLint likewise retains one pre-existing Prettier
error in `ChatInputDictation.test.tsx`, reproduced from the fork-tip file.
The optional broad `e2e` TypeScript project retains its pre-existing `rootDir`
and selector typing errors at the fork tip; the required
`tsconfig.remote-responses.json` check passes.

Remote acceptance requires a fresh successful
`.github/workflows/e2e-tests.yml` run for the exact final pushed commit. Its
result cannot exist before the merge commit is created and is therefore
reported in the final sync handoff.

## Superseded when

A later approved sync or upstream implementation provides equivalent built-in
Pal migration semantics and preserves every referenced fork invariant with
equal or stronger regression coverage.
