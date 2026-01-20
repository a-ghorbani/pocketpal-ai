# Creating Device Pools for Crash Reproduction

This guide explains how to create and use AWS Device Farm device pools to target specific devices for crash reproduction testing.

## Why Device Pools?

From our crash analysis, we've identified that certain model + device combinations cause crashes more frequently. By creating targeted device pools, we can:

1. Reproduce crashes systematically
2. Verify fixes on problematic devices
3. Run regression tests on specific hardware

## Target Devices (from Crash Analysis)

Based on Play Vitals crash data, these devices have shown model loading issues:

| Device | Model Code | Android | RAM | Use Case |
|--------|------------|---------|-----|----------|
| Samsung Galaxy Note 10+ | SM-N975F | 12 | 12GB | Top model load errors |
| Realme C25 | RMX3261 | 11 | 4GB | Low-end device crashes |
| Samsung Galaxy A32 5G | SM-A326U | 13 | 4GB | Mid-range issues |
| Samsung Galaxy S24 Ultra | SM-S928B | 14 | 12GB | High-end flagship |
| OnePlus Nord CE 2 5G | IV2201 | 12 | 6GB | Mid-range crashes |
| Xiaomi Redmi Note 10 Pro | M2101K6G | 11 | 6GB | MIUI-specific issues |

## Steps to Create a Device Pool

### 1. Navigate to AWS Device Farm Console

1. Go to https://console.aws.amazon.com/devicefarm/
2. Select your region (typically us-west-2)
3. Select your project (PocketPal)

### 2. Create the Device Pool

1. Click **"Device pools"** in the left sidebar
2. Click **"Create device pool"**
3. Configure the pool:
   - **Name**: Use a descriptive name (e.g., `Crash-Repro-SM-N975F` or `Low-End-Android`)
   - **Description**: Add context (e.g., "Samsung Galaxy Note 10+ for model load crash repro")

### 3. Add Devices

1. Click **"Add devices"**
2. Search by model code (e.g., `SM-N975F`)
3. Select the specific device(s)
4. Click **"Add selected"**

### 4. Copy the ARN

After creating the pool:
1. Click on the pool name
2. Copy the **ARN** (looks like: `arn:aws:devicefarm:us-west-2:123456789:devicepool:abc123...`)

## Using Device Pools with crash-repro

### Option 1: Environment Variable

Set the device pool ARN in your `.env` file:

```bash
# e2e/.env
AWS_DEVICE_POOL_ARN_ANDROID="arn:aws:devicefarm:us-west-2:123456789:devicepool:abc123..."
```

Then run:
```bash
yarn crash-repro --model gemma-2-2b
```

### Option 2: Command Line

Pass the device pool directly:

```bash
yarn crash-repro --model gemma-2-2b --device-pool "arn:aws:devicefarm:us-west-2:123456789:devicepool:abc123..."
```

### Option 3: List Available Pools

To see all configured device pools:

```bash
yarn crash-repro --list-pools
```

## Recommended Device Pool Configurations

### Low-End Crash Repro Pool

For reproducing crashes on memory-constrained devices:

- Realme C25 (RMX3261) - 4GB RAM
- Samsung Galaxy A32 5G (SM-A326U) - 4GB RAM
- Xiaomi Redmi 9 (M2004J19AG) - 3GB RAM

### Model Load Error Pool

For investigating "Failed to load model" errors:

- Samsung Galaxy Note 10+ (SM-N975F)
- OnePlus Nord CE 2 5G (IV2201)
- Samsung Galaxy S21 (SM-G991B)

### Vision Model Pool

For testing vision/multimodal models:

- Samsung Galaxy S24 Ultra (SM-S928B) - good camera, high RAM
- Google Pixel 7 Pro (GP7P) - reference Android device
- Samsung Galaxy A54 5G (SM-A546B) - mid-range with good camera

## Testing Workflow

### 1. Identify the Crash

From Play Vitals or user reports, identify:
- Model ID (e.g., `gemma-2-2b`)
- Device model code (e.g., `SM-N975F`)
- Android version

### 2. Create/Select Device Pool

Create a pool with the target device or use an existing pool.

### 3. Run Crash Reproduction

```bash
# Run the load-stress test on the target device
yarn crash-repro --model gemma-2-2b --device-pool arn:aws:...

# Or test locally first
yarn crash-repro --model gemma-2-2b --local
```

### 4. Analyze Results

Check `e2e/debug-output/` for:
- `load-stress-report-*.json` - detailed timing and error data
- Screenshots on failures
- Console output with error messages

### 5. Iterate

After fixing, run the same test to verify the fix:

```bash
yarn crash-repro --model gemma-2-2b --device-pool arn:aws:...
```

## Cost Optimization Tips

1. **Start local**: Test locally first with `--local` flag
2. **Single device pools**: Create pools with just one device for targeted testing
3. **Use curated pools**: AWS's "Top Devices" pool is free for initial testing
4. **Short test runs**: The load-stress test runs 3 cycles by default, which is usually sufficient

## Troubleshooting

### "No device pools available"

- Check that `AWS_DEVICE_FARM_PROJECT_ARN` is set in `.env`
- Verify AWS credentials are configured
- Run `yarn crash-repro --list-pools` to debug

### "Device not available"

- Some devices may have limited availability
- Try adding multiple similar devices to the pool
- Check device availability in the AWS console

### Test times out on Device Farm

- Increase `downloadTimeout` in the model config
- Check if the device has sufficient storage
- Try a smaller model first to validate the setup
