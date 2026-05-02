# PocketPal E2E Tests

End-to-end tests using Appium + WebDriverIO for local devices and AWS Device Farm.

## Setup

```bash
cd e2e
yarn install
```

## Test Specs

| Spec | What it tests | Duration |
|------|---------------|----------|
| `quick-smoke` | Full user journey: navigate to Models → search HuggingFace → download SmolLM2-135M → load model → chat → verify inference completes | ~50-70s/device |
| `load-stress` | Download model, run multiple load/unload cycles with inference between each. Catches crash-on-reload bugs | ~5-10 min/device |
| `thinking` | Loads Qwen3-0.6B (thinking model), verifies thinking toggle, thinking bubble appears, toggle off suppresses it | ~3-5 min/device |
| `diagnostic` | Dumps Appium page source XML at each screen. For debugging selectors, not a real test | ~10s |
| `benchmark-matrix` | Iterates {models} × {quants} × {backends} on Android, writes canonical JSON report per run. Measurement infrastructure, not an automated gate. | ~25-45 min |

## Benchmark Matrix (Android)

Drives the in-app **BenchmarkRunnerScreen** via deep link (`pocketpal://e2e/benchmark`) — no WDIO required for ad-hoc runs. Three tiers gated by `BENCH_TIER`:

| Tier | Models × quants × backends | Cells | Runtime | When |
|------|----------------------------|------:|---------|------|
| `smoke` (default) | 3 × 3 × 2 | 18 | ~10–15 min | Regression gate |
| `focused` | 6 × 6 × 2 | ~60 | ~30–45 min | Investigation |
| `full` | 11 × 8 × 2 | ~165 | ~3 hr/device | Default-tier recalibration |

Model + quant rosters live in [`fixtures/benchmark-models.ts`](fixtures/benchmark-models.ts) (single source: `BENCHMARK_FULL_MODELS`; smaller tiers derived as id filters).

**One-shot run** (assumes E2E-flavor APK is already installed on the device):

```bash
# 1. Generate config + adb push to device
BENCH_TIER=smoke yarn build:bench-config --push           # default device
BENCH_TIER=full  yarn build:bench-config --push <udid>    # specific device

# 2. Cold-launch the runner via deep link
adb shell am start -a android.intent.action.VIEW \
  -d 'pocketpal://e2e/benchmark' -p com.pocketpalai.e2e

# 3. Tap "Run benchmark matrix" on the screen (or via adb input tap)
# 4. Wait for `bench-runner-screen-status` content-desc == "complete"
# 5. Pull the report
adb pull /sdcard/Android/data/com.pocketpalai.e2e/files/benchmark-report-*.json
```

Filters narrow the chosen tier (cannot widen it):

```bash
BENCH_TIER=full BENCH_MODELS=qwen3.5-2b BENCH_QUANTS=q4_0,q6_k yarn build:bench-config
```

Heavy models (Phi-3.5, Phi-4-mini, Gemma-4-E2B) are last in the `full` tier; if the OS ANR-kills the app on a heavy CPU bench, partial-row data from earlier cells survives in the JSON report.

### Baselines (`baselines/benchmark/<device>.json`)

Committed reference data the [`benchmark-compare.ts`](scripts/benchmark-compare.ts) regression checker runs against. One file per device class. Refresh by re-running the `full` tier on that device, then merging the captured reports:

```bash
npx ts-node scripts/merge-bench-reports.ts \
  --input '/path/to/benchmark-report-*.json' \
  --out baselines/benchmark/<device-slug>.json \
  --device 'POCO X9 Pro Myron' \
  --soc 'Snapdragon 8 Elite Gen 5 / Adreno 840' \
  --commit "$(git rev-parse --short HEAD)" \
  --llama-rn-version "$(node -p 'require(\"../package.json\").dependencies[\"llama.rn\"]')" \
  --drop-models lfm2-1.2b
```

The merger dedupes across multiple raw reports (latest run per `model_id × quant × backend` wins), drops stale model ids, sorts deterministically, and strips the debug-only `log_signals.raw_matches` so baseline diffs stay focused on perf deltas. Memory-profile baselines live in the sibling [`baselines/memory/`](baselines/memory/) directory.

## Local Testing

### Prerequisites
- Xcode configured (for iOS)
- Android SDK configured (for Android)
- Build the app first (see below)

### Build

```bash
# iOS simulator
yarn ios:build:e2e

# iOS real device (IPA, requires code signing)
yarn ios:build:ipa

# Android E2E APK (required — prod APK has no automation bridge)
yarn android:build:e2e
# Installs as com.pocketpalai.e2e and coexists side-by-side with the
# prod install (com.pocketpalai). E2E_BUILD=true is set automatically
# so the automation bridge (src/__automation__/) ships in this APK.
```

**Flavor.** E2E targets the `e2e` flavor (`com.pocketpalai.e2e`, debuggable),
which ships the automation bridge. The `prod` flavor has no bridge — specs
will silently fail there.

**Firebase.** `android/app/google-services.json` (gitignored) must contain
client entries for both `com.pocketpalai` and `com.pocketpalai.e2e`. If the
build fails with a google-services plugin error, the `.e2e` client entry is
missing from your local copy.

### Unified E2E Runner

All local test execution goes through a single `yarn e2e` command:

```bash
# Simple smoke test on default device
yarn e2e:ios --spec quick-smoke
yarn e2e:android --spec quick-smoke

# Test each model in isolation (one WDIO process per model)
yarn e2e:ios --each-model
yarn e2e:ios --each-model --models smollm2-135m,qwen3-0.6b

# Crash reproduction (load-stress on a specific model)
yarn e2e --platform ios --spec load-stress --models gemma-2-2b

# Multi-device pipeline (iterate across devices from devices.json)
yarn e2e:ios --each-device
yarn e2e:ios --devices virtual-only --skip-build

# Run on whatever real devices are currently plugged in
yarn e2e:android --devices connected --skip-build

# Full matrix: every model x every device
yarn e2e:ios --each-device --each-model

# Include crash-repro models in the pool
yarn e2e:ios --each-model --all-models

# Dry run (preview what would execute)
yarn e2e --platform both --each-device --each-model --dry-run

# List available models
yarn e2e --list-models
```

### Flags

| Flag | Values | Default | Description |
|------|--------|---------|-------------|
| `--platform` | `ios`, `android`, `both` | _(required)_ | Which platform(s) to test |
| `--spec` | `quick-smoke`, `load-stress`, `diagnostic`, `language`, `all` | `quick-smoke` | Which test spec to run |
| `--models` | comma-separated model IDs | _(all)_ | Specific model(s) to test |
| `--each-model` | _(flag)_ | off | Iterate spec once per model (isolated process) |
| `--all-models` | _(flag)_ | off | Include crash-repro models in the pool |
| `--devices` | `all`, `virtual-only`, `real-only`, `connected`, or comma-separated IDs | `all` | Device filter (implies `--each-device`) |
| `--each-device` | _(flag)_ | off | Iterate across devices from `devices.json` |
| `--mode` | `local`, `device-farm` | `local` | Execution mode (switches wdio config) |
| `--skip-build` | _(flag)_ | builds by default | Skip app builds, reuse existing |
| `--dry-run` | _(flag)_ | off | Print what would run without executing |
| `--report-dir` | path | auto-timestamped | Override report output directory |
| `--list-models` | _(flag)_ | off | List all available models and exit |

### Direct WDIO Commands

For ad-hoc runs where you need to pass WDIO-specific flags, invoke WDIO directly:

```bash
npx wdio run wdio.ios.local.conf.ts --spec specs/quick-smoke.spec.ts
npx wdio run wdio.android.local.conf.ts --spec specs/load-stress.spec.ts
```

### Environment Variables (WDIO Configs)

Both `wdio.ios.local.conf.ts` and `wdio.android.local.conf.ts` accept these env vars with backward-compatible defaults:

| Env Var | iOS Default | Android Default | Purpose |
|---------|-------------|-----------------|---------|
| `E2E_DEVICE_NAME` | `iPhone 17 Pro` | `emulator-5554` | Device/simulator name |
| `E2E_PLATFORM_VERSION` | `26.0` | `16` | OS version |
| `E2E_DEVICE_UDID` | _(none)_ | _(none)_ | Device UDID (required for real devices) |
| `E2E_APP_PATH` | `../ios/build/.../PocketPal.app` | `../android/.../app-e2e-releaseE2e.apk` | Path to built app |
| `E2E_APPIUM_PORT` | `4723` | `4723` | Appium server port |
| `E2E_XCODE_ORG_ID` | _(none)_ | N/A | Apple Team ID (required for real iOS devices) |
| `E2E_XCODE_SIGNING_ID` | `Apple Development` | N/A | Code signing identity for WDA |

### Multi-Device Setup

To use `--each-device`, set up a device inventory:

1. Copy the template:
   ```bash
   cp devices.template.json devices.json
   ```

2. Edit `devices.json` with your actual devices (simulators, emulators, USB-connected real devices). See `devices.template.json` for the format.

   **Finding device UDIDs:**
   ```bash
   # iOS
   xcrun xctrace list devices

   # Android
   adb devices -l
   ```

   > `devices.json` is gitignored — each machine has its own.

### Reports

Each run creates a timestamped directory under `e2e/reports/`:

```
e2e/reports/2026-02-13T16-14-12-758/
  summary.json              # Overall results + per-run breakdown
  junit-results.xml         # Merged JUnit XML (for CI integration)
  iphone-17-pro-sim/        # Per-device subdirectory (when --each-device)
    smollm2-135m/           # Per-model subdirectory (when --each-model)
      junit-smollm2-135m.xml
      screenshots/
```

## AWS Device Farm Testing

### Prerequisites
1. AWS Account with Device Farm access
2. Create a Device Farm project
3. Set environment variables or GitHub Secrets:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `AWS_DEVICE_FARM_PROJECT_ARN`

### Run via GitHub Actions
1. Go to Actions → "E2E Tests (AWS Device Farm)"
2. Click "Run workflow"
3. Select platform (android, ios, or both)

### Run manually
```bash
yarn e2e:aws --platform android --app path/to/app.apk
```

## Project Structure

```
e2e/
├── specs/                        # Test specifications
│   ├── quick-smoke.spec.ts       # Core smoke test (model download + chat)
│   ├── load-stress.spec.ts       # Load/unload cycle crash repro
│   ├── diagnostic.spec.ts        # Page source dumper for debugging
│   └── features/                 # Feature-level tests
│       ├── thinking.spec.ts      # Thinking toggle + reasoning bubble
│       └── language.spec.ts      # Language switching UI validation
├── pages/                        # Page Object Model
│   ├── BasePage.ts               # Abstract base (waitFor, tap, type)
│   ├── ChatPage.ts               # Chat screen interactions
│   ├── DrawerPage.ts             # Navigation drawer
│   ├── ModelsPage.ts             # Models screen + FAB menu
│   ├── HFSearchSheet.ts          # HuggingFace search bottom sheet
│   └── ModelDetailsSheet.ts      # Model details + download
├── helpers/
│   ├── selectors.ts              # Cross-platform element selectors
│   ├── gestures.ts               # Swipe/scroll gestures (W3C Actions)
│   └── model-actions.ts          # Reusable download/load/inference helpers
├── fixtures/
│   ├── models.ts                 # General-purpose E2E fixtures (quick-smoke, language, …)
│   ├── benchmark-models.ts       # Benchmark matrix tiers (smoke/focused/full)
│   └── test-image.jpg            # For vision model tests
├── scripts/
│   ├── run-e2e.ts                # Unified E2E test runner (models, devices, specs)
│   ├── run-aws-device-farm.ts    # AWS Device Farm orchestration
│   ├── build-bench-config.ts     # Generate benchmark bench-config.json from a tier
│   └── benchmark-compare.ts      # Diff two benchmark reports (>15% regression)
├── devices.template.json         # Device inventory template (copy to devices.json)
├── wdio.shared.conf.ts           # Shared WDIO configuration
├── wdio.ios.local.conf.ts        # Local iOS (env-var-driven)
├── wdio.android.local.conf.ts    # Local Android (env-var-driven)
├── wdio.ios.conf.ts              # AWS Device Farm iOS
├── wdio.android.conf.ts          # AWS Device Farm Android
└── testspec-*.yml                # AWS Device Farm test specs
```

## Writing Tests

### Selectors
Use `testID` and `accessibilityLabel` for reliable cross-platform selectors:

```typescript
import {Selectors} from '../helpers/selectors';

// By testID
await $(Selectors.byTestId('send-button')).click();

// By text (exact match)
await $(Selectors.byText('Models')).click();

// By partial text
await $(Selectors.byPartialText('Download')).click();

// By accessibility label
await $(Selectors.byAccessibilityLabel('Chat input')).click();
```

### Page Objects
Use page objects for common interactions:

```typescript
import {ChatPage, DrawerPage, ModelsPage} from '../pages';

await ChatPage.openDrawer();
await DrawerPage.navigateToModels();
await ModelsPage.openHuggingFaceSearch();
```

## Cost Estimation (AWS Device Farm)

| Usage | Approximate Cost |
|-------|------------------|
| 10 min test run, 1 device | ~$1.70 |
| 10 min test run, 2 devices (iOS+Android) | ~$3.40 |
| 30 runs/month, 2 devices | ~$100/month |

Pricing: $0.17 per device minute

## Benchmark Matrix

The `benchmark-matrix` spec is **measurement infrastructure**, not an automated gate. It iterates `{models} × {quants} × {backends}` on Android, drives the in-app Benchmark screen for each cell, and writes a canonical JSON report to `e2e/debug-output/benchmarks/benchmark-<device_slug>-<commit>.json`. The JSON is incremental: a mid-matrix crash preserves completed rows.

v1 scope: Android only. iOS (Metal) and Hexagon NPU are explicit follow-ups. The matrix is 2 models × 8 quants × 2 backends = 32 runs at full scale; env-var filters reduce this.

### Usage

```bash
# Full matrix on the currently connected Android device (~25-45 min)
yarn e2e --platform android --spec benchmark-matrix --skip-build

# Single cell (smoke)
BENCH_MODELS=qwen3-1.7b BENCH_QUANTS=q4_0 BENCH_BACKENDS=cpu \
  yarn e2e --platform android --spec benchmark-matrix --skip-build

# Preseeded mode (see "Preseed workflow" below)
MODELS_PRESEEDED=1 yarn e2e --platform android --spec benchmark-matrix --skip-build
```

### Environment variables

| Var | Values | Description |
|-----|--------|-------------|
| `BENCH_MODELS` | comma-separated model ids (lowercase) | e.g. `qwen3-1.7b,gemma-3-1b` |
| `BENCH_QUANTS` | comma-separated rung labels | e.g. `q4_0,q6_k`; full set: `iq1_s,q2_k,q3_k_m,q4_0,q4_k_m,q5_k_m,q6_k,q8_0` |
| `BENCH_BACKENDS` | comma-separated tiers | `cpu`, `gpu` |
| `MODELS_PRESEEDED` | `1` to enable | Skip downloads; use already-pushed GGUFs on device |
| `E2E_DEVICE_SOC` | free-form string | Recorded in the JSON `soc` field; not used to drive tests |

### JSON schema

Top-level:
```jsonc
{
  "version": "1.0",
  "device": "SM-S948U",
  "soc": "Snapdragon 8 Elite Gen 2",   // or null
  "commit": "abc1234",
  "llama_rn_version": "0.12.0-rc.8",
  "platform": "android",
  "os_version": "16",
  "timestamp": "2026-04-21T…",
  "preseeded": false,
  "runs": [ /* BenchmarkRun[] */ ]
}
```

Per-run (`BenchmarkRun`):
```jsonc
{
  "model_id": "qwen3-1.7b",
  "quant": "q4_0",                      // canonical lowercase rung label
  "requested_backend": "cpu",           // "cpu" | "gpu"
  "effective_backend": "cpu",           // see below
  "pp_avg": 123.4,                      // tokens/s, nullable
  "tg_avg": 18.2,                       // tokens/s, nullable
  "wall_ms": 24571,
  "peak_memory_mb": 812.3,              // nullable
  "log_signals": {                      // structured — see src/__automation__/logSignals.ts
    "opencl_init": true,
    "opencl_device_name": "QUALCOMM Adreno(TM) 840",
    "adreno_gen": "A8X",
    "large_buffer_enabled": true,
    "large_buffer_unsupported": false,
    "offloaded_layers": 29,
    "total_layers": 29,
    "raw_matches": [ /* up to 200 matched native-log lines, debug only */ ]
  },
  "init_settings": { /* modelStore.contextInitParams snapshot */ },
  "status": "ok",                       // "ok" | "skipped" | "failed"
  "reason": "…",                        // set on skipped
  "error": "…",                         // set on failed (first 500 chars)
  "timestamp": "2026-04-21T…"
}
```

### Interpreting `effective_backend`

Derived from the structured `log_signals` payload, not regex on raw text:

| Value | Meaning |
|-------|---------|
| `cpu` | No OpenCL init observed — pure CPU path. |
| `opencl` | OpenCL initialised, all layers offloaded to GPU, no large-buffer regression. |
| `cpu+opencl-partial` | OpenCL initialised but some layers ran on CPU, or `large_buffer_unsupported` triggered a fallback. |
| `unknown` | OpenCL initialised but layer counts absent — investigate `log_signals.raw_matches`. |

A row where `requested_backend=gpu` but `effective_backend=cpu` is the canonical "silent CPU fallback" we want to catch. The comparison script flags this as a regression even when `pp_avg` / `tg_avg` numbers look fine.

### Preseed workflow (E2E flavor required)

Preseeded mode skips all HuggingFace downloads and loads GGUFs that have already been pushed to the device's app-private storage. This is the fast path once you've downloaded each rung once.

**Precondition: the app must be the E2E flavor.** The prod `release`
APK is non-debuggable, so `adb shell run-as com.pocketpalai` and
`adb push` into `/data/data/com.pocketpalai/files/…` will not work.
The `e2e` flavor + `releaseE2e` buildType is debuggable by design
(same Hermes/release optimizer as prod, just with `debuggable=true`
flipped on). Build and install it:

```bash
yarn android:build:e2e
adb install -r android/app/build/outputs/apk/e2e/releaseE2e/app-e2e-releaseE2e.apk
```

On-device path (matches `ModelStore.getModelFullPath`, with the E2E
flavor's applicationId):

```
/data/data/com.pocketpalai.e2e/files/models/hf/<author>/<repo>/<filename>.gguf
```

Push each GGUF once:

```bash
adb shell run-as com.pocketpalai.e2e mkdir -p \
  files/models/hf/bartowski/Qwen_Qwen3-1.7B-GGUF

# copy via /data/local/tmp to avoid run-as's stdin limitations:
adb push Qwen_Qwen3-1.7B-Q4_0.gguf /data/local/tmp/
adb shell run-as com.pocketpalai.e2e sh -c \
  'cat /data/local/tmp/Qwen_Qwen3-1.7B-Q4_0.gguf > \
   files/models/hf/bartowski/Qwen_Qwen3-1.7B-GGUF/Qwen_Qwen3-1.7B-Q4_0.gguf'
```

Then run with `MODELS_PRESEEDED=1`. The spec fails fast (before touching the matrix loop) with a per-file `adb push` template if anything is missing — no silent download fallback.

### Comparing two reports

```bash
npx tsx e2e/scripts/benchmark-compare.ts \
  path/to/baseline.json path/to/current.json
```

Flags rows where either `pp_avg` or `tg_avg` delta exceeds `|delta%| > 15` (override with `--pct N`). Additional flags, all independent of numeric deltas:

- `effective_backend:<base>-><cur>` — silent backend fallback (e.g. requested GPU but ran on CPU).
- `status_regression(<status>)` — baseline row was `ok`, current row flipped to `failed`/`skipped`.
- `pp_null_regression` / `tg_null_regression` — both rows claim `status:'ok'` but the current numeric metric is `null` while the baseline was numeric (catches partial native failures the screen didn't reject as failed).
- Top-level `bench_protocol_mismatch` — the persisted `bench` block (`pp`/`tg`/`pl`/`nr`) differs between reports. Comparison is skipped (`pass:false`) and the CLI exits 2 because pp/tg numbers are not comparable across protocols. Reports that omit the `bench` block (e.g. legacy baselines pre-v1.1) skip the check with a stderr warning.

`pass` is `true` only when no row is flagged AND `missing_in_current` is empty AND no `bench_protocol_mismatch`. Exit codes: 0 pass, 1 regression, 2 input/protocol error.

### Known limitations (v1)

- Android only. iOS Metal benchmarking is a follow-up.
- Hexagon NPU tier excluded.
- Preseed requires the E2E-flavor APK (see above).
- Static IQ1_S rung is substituted with IQ2_M for Qwen3 1.7B and Gemma 3 1B — neither is published at IQ1_S by bartowski or lmstudio-community. The canonical rung label in the JSON remains `iq1_s` so reports are comparable when IQ1_S eventually ships.
- LFM2 1.2B slot 3 is deferred: no publisher has a complete 8-quant set.
