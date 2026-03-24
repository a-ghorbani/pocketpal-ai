# PocketPal Build Lessons

## Local Verification Checklist

Before waiting for GitHub Actions to fail, run the Android preflight locally from the repository root:

```bash
cmd /c yarn.cmd preflight:android
```

This script is defined in the root `package.json`. It is repository-local, not a global machine command.

Current coverage:

```bash
cmd /c yarn.cmd l10n:validate
cmd /c yarn.cmd lint
cmd /c yarn.cmd typecheck
cmd /c yarn.cmd test --coverage
```

## Targeted Validation During Development

Use the full preflight before starting a long Android release build.

For faster local iteration on a specific change, run targeted checks:

```bash
cmd /c yarn.cmd typecheck
cmd /c npx.cmd jest --runInBand --coverage=false --runTestsByPath <test-file>
cmd /c npx.cmd eslint <changed-file-1> <changed-file-2>
```

Recommended Windows notes:

- Use `cmd /c ...cmd` to avoid PowerShell execution-policy problems with `.ps1` shims.
- Use `--runInBand` because restricted Windows environments may fail with `spawn EPERM`.
- Use `--coverage=false` when validating a single test file, otherwise unrelated global coverage thresholds may fail the run.

## Dependency Setup

If local tools are missing, install dependencies first:

```bash
cmd /c yarn.cmd install --ignore-scripts
```

On this Windows machine, plain `yarn install` may fail because the project `postinstall` runs `bash ./scripts/postinstall.sh`, and `bash` is not always available.

## Build and Test Lessons

### 1. Do not import from package-internal `src/` paths

Wrong:

```ts
import MathView from 'react-native-math-view/src/fallback';
```

Why this fails:

- Importing from `node_modules/<pkg>/src/...` can pull third-party source files into TypeScript checking.
- That bypasses the intended protection of `exclude: ["node_modules"]`.
- `skipLibCheck: true` only skips `.d.ts` files, not arbitrary `.ts` source files.

Correct approach:

- Import from the package entrypoint, for example `react-native-math-view`.
- If necessary, copy the needed logic into project-owned code instead of deep-importing package internals.

### 2. `react-native-math-view` height behavior under Fabric

Issue:

- On newer React Native versions with the new architecture enabled, `react-native-math-view` does not report formula height correctly.
- The old native measurement path is not reliable in this setup.

Current project approach:

- Render math through `MathjaxFactory` and `SvgFromXml`.
- Use explicit `size.width` / `size.height` from MathJax output.

Reference:

- `src/components/MarkdownView/MathRenderers.tsx`

### 3. `react-native-math-view` Android Gradle compatibility

Issue:

- Older versions of the library reference `jcenter()`, which breaks on newer Gradle setups.

Current fix:

- The project patch removes `jcenter()` from the library Gradle file.

Reference:

- `patches/react-native-math-view+3.9.5.patch`

### 4. `UIManagerModuleListener` compatibility issue

Issue:

- Newer React Native versions removed `UIManagerModuleListener`.
- `react-native-math-view` still imported it in `SVGShadowNode.java`, which breaks Java compilation.

Current fix:

- The project patch removes the unused import.

Reference:

- `patches/react-native-math-view+3.9.5.patch`

### 5. When library imports change, update Jest mocks at the same time

Example:

- When switching from a default `MathView` import to named exports such as `MathjaxFactory`, tests can fail if mocks still expose only the old API surface.

Rule:

- Whenever you add a new named import from an external library, check the corresponding mock under `__mocks__/external/` or `__mocks__/stores/`.
- Update the mock in the same change.

References:

- `__mocks__/external/react-native-math-view.js`
- `__mocks__/stores/chatSessionStore.ts`

### 6. Prettier and lint failures are release blockers in CI

Common causes:

- Inline formatting that Prettier rewrites.
- Mock files with arrow-function formatting inconsistent with project rules.
- Small formatting drift in `.js`, `.ts`, or `.tsx` files.

Rule:

- If CI failures are in the first stage, assume `lint`, `typecheck`, or `test --coverage` first.
- Run `cmd /c yarn.cmd preflight:android` before kicking off long release builds.

## Recommendation

Use `cmd /c yarn.cmd preflight:android` as the default local gate before Android release builds.

Use targeted `typecheck` / `jest --runInBand --coverage=false --runTestsByPath ...` / `eslint <files...>` only for quick iteration while developing a smaller change.
