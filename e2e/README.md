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
| `diagnostic` | Dumps Appium page source XML at each screen. For debugging selectors, not a real test | ~10s |

## Local Testing (Single Device)

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

### Run on a Single Device

```bash
# iOS simulator (default: iPhone 17 Pro, iOS 26.0)
yarn test:ios:local

# Android emulator (default: emulator-5554, Android 16)
yarn test:android:local

# Override device via env vars
E2E_DEVICE_NAME="iPhone 16 Pro" E2E_PLATFORM_VERSION="18.2" yarn test:ios:local

# Run a specific spec
yarn test:ios:local --spec specs/load-stress.spec.ts

# Test with a specific model
TEST_MODELS=qwen3-0.6b yarn test:ios:local --spec specs/quick-smoke.spec.ts
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

## Multi-Device Pipeline

Run E2E tests sequentially across multiple simulators, emulators, and USB-connected real devices.

### Setup

1. Copy the device inventory template:
   ```bash
   cp devices.template.json devices.json
   ```

2. Edit `devices.json` with your actual devices:
   ```json
   {
     "devices": [
       {
         "id": "iphone-17-pro-sim",
         "name": "iPhone 17 Pro Simulator",
         "platform": "ios",
         "type": "simulator",
         "enabled": true,
         "deviceName": "iPhone 17 Pro",
         "platformVersion": "26.0",
         "appPath": "../ios/build/Build/Products/Release-iphonesimulator/PocketPal.app"
       },
       {
         "id": "my-iphone",
         "name": "My iPhone (USB)",
         "platform": "ios",
         "type": "real",
         "enabled": true,
         "deviceName": "My iPhone",
         "platformVersion": "18.2",
         "udid": "00008110-XXXXXXXXXXXX",
         "appPath": "../ios/build/PocketPal.ipa"
       },
       {
         "id": "android-emu",
         "name": "Android Emulator",
         "platform": "android",
         "type": "emulator",
         "enabled": true,
         "deviceName": "emulator-5554",
         "platformVersion": "16",
         "appPath": "../android/app/build/outputs/apk/release/app-release.apk"
       },
       {
         "id": "pixel-9",
         "name": "Pixel 9 (USB)",
         "platform": "android",
         "type": "real",
         "enabled": true,
         "deviceName": "Pixel 9",
         "platformVersion": "16",
         "udid": "XXXXXXXXXXXXXXX",
         "appPath": "../android/app/build/outputs/apk/release/app-release.apk"
       }
     ]
   }
   ```

   **Finding device UDIDs:**
   ```bash
   # iOS
   xcrun xctrace list devices

   # Android
   adb devices -l
   ```

   > `devices.json` is gitignored — each machine has its own.

### Run the Pipeline

```bash
# Build + run quick-smoke on all enabled devices (both platforms)
yarn pipeline --spec quick-smoke

# iOS only
yarn pipeline:ios --spec quick-smoke

# Android only
yarn pipeline:android --spec quick-smoke

# Skip build (reuse existing builds)
yarn pipeline --platform both --spec quick-smoke --skip-build

# Run all specs on all devices
yarn pipeline --platform both --spec all --skip-build

# Specific devices by ID
yarn pipeline --platform both --devices iphone-17-pro-sim,pixel-9 --spec quick-smoke --skip-build

# Only virtual devices (simulators + emulators, no real devices)
yarn pipeline --platform both --devices virtual-only --spec quick-smoke --skip-build

# Only real devices
yarn pipeline --platform both --devices real-only --spec quick-smoke --skip-build

# Dry run (preview what would execute)
yarn pipeline --platform both --dry-run
```

### Pipeline Flags

| Flag | Values | Default | Description |
|------|--------|---------|-------------|
| `--platform` | `ios`, `android`, `both` | `both` | Which platform(s) to test |
| `--spec` | `quick-smoke`, `load-stress`, `all` | `quick-smoke` | Which test spec(s) to run |
| `--devices` | `all`, `virtual-only`, `real-only`, or comma-separated IDs | `all` | Which devices to include |
| `--skip-build` | _(flag)_ | builds by default | Skip app builds, reuse existing |
| `--dry-run` | _(flag)_ | off | Print what would run without executing |
| `--report-dir` | path | auto-timestamped | Override report output directory |

### Reports

Each pipeline run creates a timestamped directory under `e2e/reports/`:

```
e2e/reports/2026-02-13T16-14-12-758/
  summary.json              # Overall results + per-device breakdown
  junit-results.xml         # Merged JUnit XML (for CI integration)
  iphone-17-pro-sim/        # Per-device artifacts
    junit-unknown.xml
    report-smollm2-135m.json
    screenshots/
  pixel-9/
    ...
```

`summary.json` example:
```json
{
  "timestamp": "2026-02-13T16-14-12-758",
  "branch": "feature/my-branch",
  "commit": "abc1234",
  "platform": "both",
  "spec": "quick-smoke",
  "totalDevices": 4,
  "passed": 3,
  "failed": 1,
  "totalDuration": 180167,
  "results": [
    { "deviceId": "iphone-17-pro-sim", "success": true, "duration": 48671 },
    { "deviceId": "pixel-9", "success": true, "duration": 64057 }
  ]
}
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
yarn test:aws --platform android --app path/to/app.apk
```

## Project Structure

```
e2e/
├── specs/                        # Test specifications
│   ├── quick-smoke.spec.ts       # Core smoke test (model download + chat)
│   ├── load-stress.spec.ts       # Load/unload cycle crash repro
│   └── diagnostic.spec.ts        # Page source dumper for debugging
├── pages/                        # Page Object Model
│   ├── BasePage.ts               # Abstract base (waitFor, tap, type)
│   ├── ChatPage.ts               # Chat screen interactions
│   ├── DrawerPage.ts             # Navigation drawer
│   ├── ModelsPage.ts             # Models screen + FAB menu
│   ├── HFSearchSheet.ts          # HuggingFace search bottom sheet
│   └── ModelDetailsSheet.ts      # Model details + download
├── helpers/
│   ├── selectors.ts              # Cross-platform element selectors
│   └── gestures.ts               # Swipe/scroll gestures (W3C Actions)
├── fixtures/
│   ├── models.ts                 # Test model configurations + timeouts
│   └── test-image.jpg            # For vision model tests
├── scripts/
│   ├── run-e2e-pipeline.ts       # Multi-device pipeline runner
│   ├── run-model-tests.ts        # Sequential per-model test runner
│   ├── run-aws-device-farm.ts    # AWS Device Farm orchestration
│   └── run-crash-repro.ts        # Crash reproduction CLI
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
