# PocketPal E2E Tests

End-to-end tests using Appium + WebDriverIO, designed to run on AWS Device Farm.

## Setup

```bash
cd e2e
yarn install
```

## Local Testing

### Prerequisites
- Appium installed globally: `yarn global add appium`
- Android SDK configured (for Android)
- Xcode configured (for iOS on macOS)

### Run on Android Emulator
```bash
# Start Android emulator
# Build APK: cd .. && yarn build:android

yarn test:android:local
```

### Run on iOS Simulator
```bash
# Build iOS app: cd ../ios && xcodebuild ...

yarn test:ios:local
```

## AWS Device Farm Testing

### Prerequisites
1. AWS Account with Device Farm access
2. Create a Device Farm project
3. Set up the following GitHub Secrets:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `AWS_DEVICE_FARM_PROJECT_ARN`

### Run via GitHub Actions
1. Go to Actions → "E2E Tests (AWS Device Farm)"
2. Click "Run workflow"
3. Select platform (android, ios, or both)

### Run manually
```bash
export AWS_ACCESS_KEY_ID=your-key
export AWS_SECRET_ACCESS_KEY=your-secret
export AWS_DEVICE_FARM_PROJECT_ARN=arn:aws:devicefarm:us-west-2:...

yarn test:aws --platform android --app path/to/app.apk
```

## Test Structure

```
e2e/
├── specs/                    # Test specifications
│   └── model-download-chat.spec.js
├── helpers/
│   ├── selectors.js         # Element selectors
│   └── actions.js           # Reusable test actions
├── scripts/
│   └── run-aws-device-farm.js
├── wdio.shared.conf.js      # Shared WebDriverIO config
├── wdio.android.conf.js     # Android AWS config
├── wdio.ios.conf.js         # iOS AWS config
├── wdio.android.local.conf.js
└── wdio.ios.local.conf.js
```

## Writing Tests

### Selectors
Use `testID` and `accessibilityLabel` for reliable cross-platform selectors:

```javascript
const selectors = require('../helpers/selectors');

// By testID
await $(selectors.byTestId('send-button')).click();

// By text
await $(selectors.byText('Models')).click();

// By partial text
await $(selectors.byPartialText('Download')).click();
```

### Actions
Use helper actions for common operations:

```javascript
const actions = require('../helpers/actions');

await actions.navigateToModels();
await actions.openHFSearch();
await actions.searchHFModel('llama', 'bartowski');
await actions.sendMessage('Hello!');
```

## Cost Estimation (AWS Device Farm)

| Usage | Approximate Cost |
|-------|------------------|
| 10 min test run, 1 device | ~$1.70 |
| 10 min test run, 2 devices (iOS+Android) | ~$3.40 |
| 30 runs/month, 2 devices | ~$100/month |

Pricing: $0.17 per device minute
