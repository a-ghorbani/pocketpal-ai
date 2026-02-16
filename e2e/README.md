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

# Android APK
cd android && ./gradlew assembleRelease
```

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
| `E2E_APP_PATH` | `../ios/build/.../PocketPal.app` | `../android/.../app-release.apk` | Path to built app |
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
│   ├── models.ts                 # Test model configurations + timeouts
│   └── test-image.jpg            # For vision model tests
├── scripts/
│   ├── run-e2e.ts                # Unified E2E test runner (models, devices, specs)
│   └── run-aws-device-farm.ts    # AWS Device Farm orchestration
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
