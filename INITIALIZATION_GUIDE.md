# llama.rn Initialization Guide

Complete guide to initialization parameters for iOS and Android, covering device selection, memory optimization, and performance tuning.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [iOS Initialization](#ios-initialization)
3. [Android Initialization](#android-initialization)
4. [Common Parameters](#common-parameters)
5. [Quantization Types](#quantization-types)
6. [UI Configuration Guide](#ui-configuration-guide)
7. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Recommended Default Configuration

**iOS (Metal GPU):**
```typescript
const context = await initLlama({
  model: 'model-q4_k_m.gguf',
  n_gpu_layers: 99,
  kv_unified: true,                // CRITICAL: saves ~7 GB memory
  // n_parallel: 1 (optional: set to 1 if only using blocking completion())
  // devices: undefined (auto-selects Metal)
  // flash_attn_type: 'auto' (default)
});
```

**Android (Auto-detect):**
```typescript
const context = await initLlama({
  model: 'model-q4_0.gguf',       // Q4_0 or Q6_K for OpenCL
  n_gpu_layers: 99,
  kv_unified: true,                // CRITICAL: saves ~7 GB memory
  flash_attn_type: 'off',          // Required for OpenCL state save/load
  // n_parallel: 1 (optional: set to 1 if only using blocking completion())
  // devices: undefined (auto-selects GPU if available)
});
```

---

## iOS Initialization

### Device Architecture

iOS devices have two acceleration backends:
- **Metal** (GPU) - Primary acceleration, type: `GPU`
- **BLAS/Accelerate** (CPU SIMD) - Automatically added, type: `ACCEL`

### Key Parameters

#### 1. `devices` - Device Selection

**Type:** `string[] | undefined`

**Default:** `undefined` (auto-select Metal GPU)

**How auto-selection works:**

When `devices` is not specified:
1. llama.cpp scans all available backends ([llama.cpp:186-252](../cpp/llama.cpp#L186-L252))
2. Filters by type:
   - ✅ `GPU` → Metal is added
   - ❌ `CPU` → Skipped (handled separately)
   - ❌ `ACCEL` → Skipped (BLAS auto-added to runtime, not for layer placement)
3. Result: `model->devices = [Metal]`

**Available device names on iOS:**
```typescript
const devices = await getBackendDevicesInfo();
// Returns:
// [
//   { deviceName: "Metal", type: "gpu", backend: "Metal", maxMemorySize: 6442450944, ... },
//   { deviceName: "CPU", type: "cpu", backend: "CPU", ... },
//   { deviceName: "BLAS", type: "accel", backend: "BLAS", ... }
// ]
```

**Configuration options:**

##### Option 1: Auto-select (Recommended) ⭐
```typescript
const context = await initLlama({
  model: 'model.gguf',
  // devices: undefined
  n_gpu_layers: 99,
});
// Result: All layers on Metal GPU
// BLAS automatically available for CPU operations
```

**When to use:**
- ✅ Most apps (95% of use cases)
- ✅ Maximum performance
- ✅ Simplest configuration

**Pros:**
- Automatic Metal GPU selection
- BLAS still available for CPU ops
- No manual device management

**Cons:**
- None for typical usage

---

##### Option 2: Explicit Metal
```typescript
const context = await initLlama({
  model: 'model.gguf',
  devices: ['Metal'],
  n_gpu_layers: 99,
});
// Result: All layers on Metal GPU (same as auto-select)
```

**When to use:**
- Explicit control needed
- Multiple GPU scenario (future-proofing)

**Pros:**
- Explicit and clear
- Future-proof if multiple GPUs supported

**Cons:**
- Redundant with auto-select
- More code

---

##### Option 3: Metal + CPU Split (⚠️ NOT Recommended)
```typescript
const context = await initLlama({
  model: 'model.gguf',
  devices: ['Metal', 'CPU'],
  n_gpu_layers: 99,
});
// Result: Layers SPLIT ~75% Metal, ~25% CPU based on free memory
```

**When to use:**
- ❌ Almost never on iOS
- Model too large for GPU VRAM (use smaller model instead)

**Pros:**
- Can handle larger models that don't fit in VRAM

**Cons:**
- ❌ Slower (data transfer between Metal ↔ CPU)
- ❌ Higher power consumption
- ❌ Worse user experience

---

##### Option 4: Metal + BLAS Split (❌ NEVER Do This)
```typescript
const context = await initLlama({
  model: 'model.gguf',
  devices: ['Metal', 'BLAS'],  // ❌ BAD
  n_gpu_layers: 99,
});
// Result: Layers split between Metal and CPU RAM (BLAS has no memory)
```

**Why this is wrong:**
- BLAS is auto-added to runtime backends anyway
- BLAS uses CPU memory, not separate memory
- Causes unnecessary layer splitting
- No performance benefit

**Never use this configuration.**

---

##### Option 5: CPU Only
```typescript
const context = await initLlama({
  model: 'model.gguf',
  n_gpu_layers: 0,  // CPU only
  // OR: devices: ['CPU']
});
```

**When to use:**
- Testing/debugging
- Troubleshooting GPU issues
- Power saving (rare)

**Pros:**
- Most compatible
- Lower power (no GPU)

**Cons:**
- Very slow (5-10x slower than Metal)

---

#### 2. `n_gpu_layers` - GPU Offloading

**Type:** `number`

**Default:** `0` (CPU only)

**Recommended:** `99` (offload all layers)

**What it means:**
- Number of transformer layers to offload to devices in the `devices` array
- Special value `99` = "all layers"
- Layers from the END of the model are offloaded first

**How it works with devices:**

```typescript
// Scenario A: Auto-select (devices undefined)
devices: undefined,
n_gpu_layers: 99,
// → All layers on Metal GPU

// Scenario B: Metal + CPU
devices: ['Metal', 'CPU'],
n_gpu_layers: 99,
// → 99 layers eligible for offload, split 75/25 between Metal and CPU

// Scenario C: Partial offload
devices: ['Metal'],
n_gpu_layers: 20,
// → Last 20 layers on Metal, rest on CPU
```

**Recommendations:**

| Model Size | iPhone Model | n_gpu_layers | Reasoning |
|------------|--------------|--------------|-----------|
| 1B-3B Q4 | Any iPhone | `99` | Fits easily in VRAM |
| 7B Q4 | iPhone 15 Pro+ | `99` | ~4GB, fits in VRAM |
| 7B Q8 | iPhone 15 Pro+ | `99` | ~7GB, may be tight |
| 13B Q4 | iPhone 15 Pro+ | `50-80` | ~8GB, partial offload |
| 13B+ | Any | `0-50` | Too large, use CPU or smaller model |

---

#### 3. `kv_unified` - KV Cache Memory Layout

**Type:** `boolean`

**Default:** `false`

**Recommended:** `true` (always on mobile)

**What it controls:**
Number of KV cache memory streams:
- `false` → `n_parallel` streams (default 8)
- `true` → 1 unified stream

**Memory impact:**

For a 7B model with 2048 context:
- `kv_unified: false` → 8 GB KV cache (8 streams × 1GB each)
- `kv_unified: true` → 1 GB KV cache (1 stream)
- **Savings: 7 GB**

**Even if you only use 1 conversation, memory is allocated for all 8 streams by default!**

```typescript
// ❌ BAD: Wastes 7 GB on unused KV cache streams
const context = await initLlama({
  model: 'model.gguf',
  // kv_unified: false (default)
  // n_parallel: 8 (default)
});
// Memory: Model (5GB) + KV cache (8GB) = 13GB → Out of memory!

// ✅ GOOD: Efficient memory usage
const context = await initLlama({
  model: 'model.gguf',
  kv_unified: true,
});
// Memory: Model (5GB) + KV cache (1GB) = 6GB → Fits!
```

**Always use `kv_unified: true` on mobile iOS devices.**

---

#### 4. `flash_attn_type` - Flash Attention

**Type:** `'auto' | 'on' | 'off'`

**Default:** `'auto'`

**Recommended:** `'auto'` (works great on Metal)

**What it does:**
- Flash Attention = memory-efficient attention algorithm
- Reduces memory usage: O(N²) → O(N)
- Speeds up attention computation

**Options:**

| Value | Behavior | iOS Metal Support |
|-------|----------|-------------------|
| `'auto'` | Auto-enable if supported | ✅ Enabled (Metal supports it) |
| `'on'` | Force enable | ✅ Works on Metal |
| `'off'` | Force disable | ✅ Works (slower, more memory) |

**iOS recommendation: Use `'auto'` (default).**

Metal fully supports Flash Attention, and llama.cpp will automatically enable it.

---

### iOS Device Selection Guide

#### Should you use `getBackendDevicesInfo()`?

**Short answer: No, not necessary for most iOS apps.**

**Reasons:**
1. iOS devices have consistent hardware (Metal always available)
2. Auto-selection works perfectly
3. Only one GPU per device
4. Adds unnecessary complexity

**When to use `getBackendDevicesInfo()` on iOS:**
- Displaying device info to user (educational/debugging)
- Advanced users who want manual control
- Multi-GPU scenarios (future iPads/Macs with multiple GPUs)

**Example usage:**
```typescript
// Optional: Show device info to user
const devices = await getBackendDevicesInfo();
const gpuInfo = devices.find(d => d.type === 'gpu');
console.log(`Using GPU: ${gpuInfo.deviceName} with ${(gpuInfo.maxMemorySize / 1024**3).toFixed(1)}GB VRAM`);

// Then initialize with auto-select
const context = await initLlama({
  model: 'model.gguf',
  n_gpu_layers: 99,
  kv_unified: true,
});
```

---

### iOS Configuration Examples

#### Example 1: Simple Chat App (Recommended)
```typescript
const context = await initLlama({
  model: 'llama-3.2-3b-q4_k_m.gguf',
  n_gpu_layers: 99,
  kv_unified: true,
  n_ctx: 2048,
});
```

#### Example 2: Large Model on iPhone 15 Pro
```typescript
const context = await initLlama({
  model: 'llama-3-8b-q4_0.gguf',
  n_gpu_layers: 99,
  kv_unified: true,
  n_ctx: 4096,
  cache_type_k: 'q8_0',  // Quantize KV cache to save memory
  cache_type_v: 'q8_0',
});
```

#### Example 3: Debugging/Testing
```typescript
const context = await initLlama({
  model: 'model.gguf',
  n_gpu_layers: 0,      // CPU only for testing
  kv_unified: true,
  n_threads: 6,         // Use 6 CPU threads
});
```

---

## Android Initialization

### Device Architecture

Android devices (Qualcomm Snapdragon) can have:
- **OpenCL** (GPU) - Adreno 700+ GPUs, type: `GPU`
- **Hexagon HTP** (NPU) - Snapdragon 8 Gen 1+, type: `ACCEL`
- **CPU** - ARM cores with NEON, type: `CPU`

### Key Parameters

#### 1. `devices` - Device Selection

**Type:** `string[] | undefined`

**Default:** `undefined` (auto-select)

**How auto-selection works on Android:**

When `devices` is not specified:
1. Calls `get_filtered_default_devices()` ([jni.cpp:49-106](../android/src/main/jni.cpp#L49-L106))
2. Scans available backends:
   - ✅ `GPU` (OpenCL/Adreno) → Added if present
   - ❌ `CPU` → Skipped
   - ❌ `ACCEL` (Hexagon) → **Explicitly excluded** (experimental)
3. Falls back to CPU if no GPU found

**Important: Hexagon HTP is NOT auto-selected, must be specified explicitly.**

**Available device names on Android:**
```typescript
const devices = await getBackendDevicesInfo();

// Example on Snapdragon 8 Gen 3:
// [
//   { deviceName: "CPU", type: "cpu", backend: "CPU", ... },
//   { deviceName: "HTP73", type: "accel", backend: "Hexagon", maxMemorySize: 8589934592, ... },
//   { deviceName: "Adreno (TM) 740", type: "gpu", backend: "OpenCL", maxMemorySize: 6442450944, ... }
// ]

// Example on MediaTek/Exynos (no Qualcomm GPU):
// [
//   { deviceName: "CPU", type: "cpu", backend: "CPU", ... }
// ]
```

**Configuration options:**

##### Option 1: Auto-select (Recommended for Compatibility) ⭐
```typescript
const context = await initLlama({
  model: 'model-q4_0.gguf',  // Q4_0 or Q6_K for OpenCL
  n_gpu_layers: 99,
  kv_unified: true,
  flash_attn_type: 'off',
});
// Result:
// - Adreno GPU if available → uses OpenCL
// - Falls back to CPU if no GPU
// - Hexagon NOT used (experimental)
```

**When to use:**
- ✅ Maximum compatibility
- ✅ Works on all Android devices
- ✅ Stable and well-tested

**Pros:**
- Automatic GPU detection
- Graceful fallback to CPU
- No device-specific code

**Cons:**
- Doesn't use Hexagon (slower than possible on Snapdragon 8 Gen 1+)
- Requires Q4_0 or Q6_K quantization

---

##### Option 2: Explicit OpenCL GPU
```typescript
const devices = await getBackendDevicesInfo();
const adrenoGpu = devices.find(d => d.backend === 'OpenCL');

if (adrenoGpu) {
  const context = await initLlama({
    model: 'model-q4_0.gguf',
    devices: [adrenoGpu.deviceName],  // e.g., "Adreno (TM) 740"
    n_gpu_layers: 99,
    kv_unified: true,
    flash_attn_type: 'off',
  });
}
```

**When to use:**
- Need to verify GPU availability first
- Display GPU info to user
- Conditional behavior based on GPU

**Pros:**
- Explicit control
- Can show GPU info to user
- Fail gracefully if no GPU

**Cons:**
- More code
- Need to handle no-GPU case

---

##### Option 3: Hexagon HTP Only (Maximum Performance) 🚀

**⚠️ Prerequisites:**
1. Device must have Snapdragon 8 Gen 1+ (SM8450+) with HTP support
2. **Required:** Add to `AndroidManifest.xml`:
```xml
<uses-native-library android:name="libcdsprpc.so" android:required="false" />
```

**Initialization:**
```typescript
const context = await initLlama({
  model: 'model.gguf',  // Any quantization works
  devices: ['HTP*'],    // Wildcard: all HTP devices
  n_gpu_layers: 99,
  kv_unified: true,
  flash_attn_type: 'off',  // May be required
});
```

**When to use:**
- Snapdragon 8 Gen 1+ devices
- Maximum performance needed
- User accepts experimental features

**Pros:**
- ⚡ Fastest inference (2-3x faster than OpenCL)
- Lower power consumption
- Works with any quantization

**Cons:**
- ⚠️ Experimental (may crash)
- Only Snapdragon 8 Gen 1+ (SM8450+)
- May have accuracy issues

**HTP Wildcard Expansion:**

`'HTP*'` is expanded to all matching devices ([src/index.ts:1164-1176](../src/index.ts#L1164-L1176)):
```typescript
// Before expansion:
devices: ['HTP*']

// After expansion (on SD8G3):
devices: ['HTP73']
```

**Specific HTP devices:**
```typescript
devices: ['HTP73']      // Single session
devices: ['HTP73', 'HTP74']  // Multiple sessions (if available)
```

---

##### Option 4: Hexagon + OpenCL Hybrid (⚠️ Experimental)
```typescript
const context = await initLlama({
  model: 'model-q4_0.gguf',
  devices: ['HTP*', 'Adreno (TM) 740'],
  n_gpu_layers: 99,
  kv_unified: true,
  flash_attn_type: 'off',
});
// Result: Layers split between Hexagon NPU and Adreno GPU based on memory
```

**When to use:**
- ❌ Almost never (highly experimental)
- Research/benchmarking

**Pros:**
- Uses both NPU and GPU
- Maximum hardware utilization

**Cons:**
- ❌ Very experimental
- ❌ High complexity
- ❌ Data transfer overhead
- ❌ May crash

---

##### Option 5: CPU Only
```typescript
const context = await initLlama({
  model: 'model.gguf',
  n_gpu_layers: 0,
  kv_unified: true,
});
```

**When to use:**
- Non-Qualcomm devices (MediaTek, Exynos)
- GPU not available
- Maximum compatibility

**Pros:**
- Works on all devices
- Most stable

**Cons:**
- Slow (5-10 tokens/sec)

---

#### 2. `n_gpu_layers` - GPU/NPU Offloading

**Type:** `number`

**Default:** `0`

**Recommended:** `99` (all layers)

**Important: The name is misleading!**

Despite the name "gpu_layers", this parameter controls offloading to **any device in the `devices` array**, including:
- OpenCL GPU
- Hexagon NPU (type: ACCEL)
- CPU (if in devices array)

**More accurate name would be: `n_offload_layers`**

**How it works:**

```typescript
// Example: 32-layer model

// All layers to GPU
devices: ['Adreno (TM) 740'],
n_gpu_layers: 99,
// → Layers 0-31 on GPU

// All layers to Hexagon
devices: ['HTP73'],
n_gpu_layers: 99,
// → Layers 0-31 on Hexagon NPU

// Partial offload
devices: ['Adreno (TM) 740'],
n_gpu_layers: 20,
// → Layers 0-11: CPU
// → Layers 12-31: GPU (last 20 layers)

// Split between devices
devices: ['HTP73', 'Adreno (TM) 740'],
n_gpu_layers: 99,
// → Layers split ~75% HTP, ~25% Adreno (based on free memory)
```

**Recommendations by device:**

| Device | GPU/NPU | n_gpu_layers | Model Size |
|--------|---------|--------------|------------|
| Snapdragon 8 Gen 3/4 | HTP + Adreno | `99` | Up to 7B Q4 |
| Snapdragon 8 Gen 2 | Adreno 740 | `99` | Up to 3B Q4 |
| Snapdragon 8 Gen 1 | Adreno 730 | `99` | Up to 3B Q4 |
| Snapdragon 7 series | Adreno 6xx | `50-99` | Up to 1B Q4 |
| MediaTek/Exynos | CPU only | `0` | Up to 1B Q4 |

---

#### 3. `kv_unified` - KV Cache Memory Layout

**Type:** `boolean`

**Default:** `false`

**Recommended:** `true` (CRITICAL for Android)

**Why it's critical on Android:**

1. **Memory efficiency:** Saves 7 GB with default `n_parallel: 8`
2. **OpenCL requirement:** Required for state save/load
3. **Limited RAM:** Most Android devices have 6-12 GB total RAM

**Memory impact example (7B model):**
```typescript
// ❌ TERRIBLE: Will likely crash
const context = await initLlama({
  model: 'llama-3-8b-q4_0.gguf',  // 5 GB
  // kv_unified: false (default)
  // n_parallel: 8 (default)
});
// Memory: Model (5GB) + KV cache (8GB) = 13GB → Out of memory!

// ✅ GOOD: Fits in RAM
const context = await initLlama({
  model: 'llama-3-8b-q4_0.gguf',
  kv_unified: true,
});
// Memory: Model (5GB) + KV cache (1GB) = 6GB → Works!
```

**Always use `kv_unified: true` on Android.**

---

#### 4. `flash_attn_type` - Flash Attention

**Type:** `'auto' | 'on' | 'off'`

**Default:** `'auto'`

**Recommended:** `'off'` (required for OpenCL state save/load)

**Why `'off'` is required on Android:**

OpenCL backend doesn't support:
1. Flash Attention operations (`LM_GGML_OP_FLASH_ATTN_EXT`)
2. State serialization with Flash Attention tensors

Without `flash_attn_type: 'off'`:
- ❌ State save/load will fail
- ⚠️ May crash during attention computation

**Configuration by backend:**

| Backend | flash_attn_type | State Save/Load |
|---------|-----------------|-----------------|
| OpenCL | `'off'` | ✅ Works (with `kv_unified: true`) |
| OpenCL | `'auto'` or `'on'` | ❌ Fails |
| Hexagon | `'off'` | ✅ Recommended |
| Hexagon | `'auto'` | ⚠️ May work (untested) |
| CPU | `'auto'` | ✅ Auto-disabled |

**Always use `flash_attn_type: 'off'` when using OpenCL or Hexagon.**

---

### Android Device Selection Guide

#### Should you use `getBackendDevicesInfo()`?

**Short answer: YES, highly recommended for Android.**

**Reasons:**
1. **Diverse hardware:** Qualcomm, MediaTek, Exynos, etc.
2. **Conditional features:** Hexagon only on Snapdragon 8 Gen 1+
3. **User choice:** Let users select GPU vs NPU vs CPU
4. **Graceful degradation:** Detect capabilities and adjust

**Recommended usage pattern:**

```typescript
import { getBackendDevicesInfo } from 'llama.rn';

// 1. Detect available devices
const devices = await getBackendDevicesInfo();

// 2. Categorize devices
const hasHexagon = devices.some(d => d.deviceName.startsWith('HTP'));
const hasAdreno = devices.some(d => d.backend === 'OpenCL');
const hasGPU = devices.some(d => d.type === 'gpu');

// 3. Choose configuration
let config;
if (hasHexagon && userWantsExperimental) {
  // Maximum performance (experimental)
  config = {
    model: 'model.gguf',
    devices: ['HTP*'],
    n_gpu_layers: 99,
    kv_unified: true,
    flash_attn_type: 'off',
  };
} else if (hasAdreno) {
  // Stable GPU acceleration
  config = {
    model: 'model-q4_0.gguf',  // Q4_0 or Q6_K only!
    n_gpu_layers: 99,
    kv_unified: true,
    flash_attn_type: 'off',
  };
} else {
  // CPU fallback
  config = {
    model: 'model-q4_0.gguf',
    n_gpu_layers: 0,
    kv_unified: true,
    n_threads: 4,
  };
}

const context = await initLlama(config);
```

---

### Android Configuration Examples

#### Example 1: Auto-detect (Recommended for Most Apps)
```typescript
const context = await initLlama({
  model: 'llama-3.2-3b-q4_0.gguf',
  n_gpu_layers: 99,
  kv_unified: true,
  flash_attn_type: 'off',
  n_ctx: 2048,
});
// Works on: All devices
// Uses: Adreno GPU if available, else CPU
```

#### Example 2: Hexagon HTP (Snapdragon 8 Gen 1+)
```typescript
const devices = await getBackendDevicesInfo();
const hasHexagon = devices.some(d => d.deviceName.startsWith('HTP'));

if (hasHexagon) {
  const context = await initLlama({
    model: 'llama-3.2-3b-q4_k_m.gguf',
    devices: ['HTP*'],
    n_gpu_layers: 99,
    kv_unified: true,
    flash_attn_type: 'off',
  });
}
// Works on: Snapdragon 8 Gen 1+
// Uses: Hexagon NPU (fastest)
```

#### Example 3: Device Selection UI
```typescript
const devices = await getBackendDevicesInfo();

// Present to user:
// - "Hexagon NPU (Experimental, Fastest)" if HTP available
// - "Adreno GPU (Recommended)" if Adreno available
// - "CPU (Compatible, Slower)" always available

const selectedDevice = await showDevicePicker(devices);

const context = await initLlama({
  model: selectedDevice.backend === 'OpenCL' ? 'model-q4_0.gguf' : 'model-q4_k_m.gguf',
  devices: selectedDevice ? [selectedDevice.deviceName] : undefined,
  n_gpu_layers: 99,
  kv_unified: true,
  flash_attn_type: 'off',
});
```

#### Example 4: Graceful Degradation
```typescript
async function initializeContext() {
  const devices = await getBackendDevicesInfo();

  // Try Hexagon first (fastest)
  const hexagonDev = devices.find(d => d.deviceName.startsWith('HTP'));
  if (hexagonDev) {
    try {
      return await initLlama({
        model: 'model.gguf',
        devices: ['HTP*'],
        n_gpu_layers: 99,
        kv_unified: true,
        flash_attn_type: 'off',
      });
    } catch (e) {
      console.warn('Hexagon failed, trying OpenCL:', e);
    }
  }

  // Try OpenCL (stable)
  const adrenoGpu = devices.find(d => d.backend === 'OpenCL');
  if (adrenoGpu) {
    try {
      return await initLlama({
        model: 'model-q4_0.gguf',
        n_gpu_layers: 99,
        kv_unified: true,
        flash_attn_type: 'off',
      });
    } catch (e) {
      console.warn('OpenCL failed, falling back to CPU:', e);
    }
  }

  // Fallback to CPU (always works)
  return await initLlama({
    model: 'model-q4_0.gguf',
    n_gpu_layers: 0,
    kv_unified: true,
  });
}
```

---

## Common Parameters

These parameters apply to both iOS and Android.

### `n_ctx` - Context Length

**Type:** `number`

**Default:** `512`

**Recommended:** `2048` - `4096`

**What it controls:**
Maximum number of tokens the model can process (prompt + completion).

**Memory impact:**
KV cache size = `n_ctx × embedding_dim × n_layers × bytes_per_element × n_stream`

**Recommendations:**

| Use Case | n_ctx | Memory Impact |
|----------|-------|---------------|
| Short chat | `512` - `1024` | Low (~256 MB) |
| Normal chat | `2048` | Medium (~512 MB) |
| Long context | `4096` | High (~1 GB) |
| Very long | `8192` | Very high (~2 GB) |

**Example:**
```typescript
const context = await initLlama({
  model: 'model.gguf',
  n_ctx: 4096,  // Support ~3000 tokens of conversation
  n_gpu_layers: 99,
  kv_unified: true,
});
```

---

### `n_batch` - Batch Size

**Type:** `number`

**Default:** `512`

**Recommended:** `512` - `2048`

**What it controls:**
Number of tokens processed simultaneously during prompt evaluation.

**Impact:**
- Higher = faster prompt processing, more memory
- Lower = slower prompt processing, less memory

**Recommendations:**
- **Mobile:** `512` (balanced)
- **High-end mobile:** `1024` - `2048`
- **Low memory:** `256`

---

### `n_threads` - CPU Threads

**Type:** `number`

**Default:** Auto (number of CPU cores)

**Recommended:** `4` - `8` on mobile

**What it controls:**
Number of CPU threads for computation.

**Only relevant when:**
- Using CPU for inference (`n_gpu_layers: 0`)
- CPU operations (tokenization, etc.)

**Example:**
```typescript
const context = await initLlama({
  model: 'model.gguf',
  n_gpu_layers: 0,  // CPU only
  n_threads: 6,     // Use 6 CPU cores
});
```

---

### `cache_type_k` and `cache_type_v` - KV Cache Quantization

**Type:** `string`

**Default:** `'f16'` (FP16, no quantization)

**Options:** `'f16'`, `'f32'`, `'q8_0'`, `'q4_0'`

**What it controls:**
Quantization of KV cache to save memory.

**Memory savings:**

| Type | Bytes/Element | Memory (7B, 2048 ctx, unified) | Quality |
|------|---------------|-------------------------------|---------|
| `f32` | 4 | 2048 MB | Best (overkill) |
| `f16` | 2 | 1024 MB | Excellent (default) |
| `q8_0` | 1 | 512 MB | Very good |
| `q4_0` | 0.5 | 256 MB | Good (slight quality loss) |

**Recommendations:**
- **Default:** Don't set (use f16)
- **Low memory:** `cache_type_k: 'q8_0', cache_type_v: 'q8_0'` (saves 50%)
- **Very low memory:** `cache_type_k: 'q4_0', cache_type_v: 'q4_0'` (saves 75%)

**Example:**
```typescript
// Large model on limited RAM
const context = await initLlama({
  model: 'llama-3-8b-q4_0.gguf',
  n_gpu_layers: 99,
  kv_unified: true,
  cache_type_k: 'q8_0',  // Quantize K cache
  cache_type_v: 'q8_0',  // Quantize V cache
});
// Saves 512 MB without noticeable quality loss
```

---

### `n_parallel` - Parallel Sequences

**Type:** `number`

**Default:** `8`

**Recommended:** Depends on your usage pattern (see below)

**What it controls:**
Maximum number of parallel sequences that can be processed concurrently. This sets `n_seq_max` in llama.cpp, which **cannot be changed** after context initialization.

**⚠️ Important: Two Different Usage Modes**

llama.rn has two distinct completion modes with different `n_parallel` requirements:

**Mode 1: Blocking Completion (`completion()` method)**
- Synchronous, single-threaded inference
- Does NOT use slots or the slot manager
- Only uses sequence ID = 0
- **`n_parallel` is IGNORED** - has no effect on performance or memory
- Only `kv_unified` affects memory

**Mode 2: Parallel Completion (`parallel.completion()` method)**
- Non-blocking, queue-based concurrent processing
- Requires calling `enableParallelMode()` first
- Each request gets its own slot with unique sequence ID
- **`n_parallel` sets the maximum number of concurrent slots**
- Requires `n_seq_max >= n_parallel` (set at initialization)

**Memory impact:**

With `kv_unified: false` (non-unified):
- `n_stream = n_parallel` (allocates separate memory for each sequence)
- KV cache memory = `n_parallel` × base_size
- Default `n_parallel: 8` wastes 7 GB even if you only use 1 conversation!

With `kv_unified: true` (unified):
- `n_stream = 1` (all sequences share the same memory stream)
- KV cache memory = 1 × base_size (regardless of `n_parallel`)
- `n_parallel` only controls the number of logical slots, not memory

**Recommendations:**

| Use Case | n_parallel | kv_unified | Memory | Notes |
|----------|------------|------------|--------|-------|
| **Blocking mode only** | `1` | `true` or `false` | 1 GB | Saves n_seq_max overhead; can't use parallel mode later |
| **Might use parallel mode** | `4-8` | `true` ⭐ | 1 GB | Future-proof; enables parallel.completion() if needed |
| **Active parallel mode** | `4-8` | `true` ⭐ | 1 GB | Enables concurrent request processing |
| ⚠️ **Bad config** | `8` | `false` | 8 GB | Wastes 7 GB! Never use on mobile |

**Examples:**

```typescript
// Example 1: Simple app, only using blocking completion()
const context = await initLlama({
  model: 'model.gguf',
  n_parallel: 1,        // Sufficient for single blocking completions
  kv_unified: true,     // Good practice (doesn't affect memory when n_parallel=1)
});

// Only this works:
await context.completion({ prompt: "..." });

// This will FAIL (n_seq_max=1, can't enable parallel mode):
// await context.parallel.enable({ n_parallel: 4 });  // ❌ Error!

// Example 2: App that might use parallel mode (future-proof)
const context = await initLlama({
  model: 'model.gguf',
  n_parallel: 4,        // Reserve capacity for up to 4 parallel slots
  kv_unified: true,     // CRITICAL: keeps memory at ~1 GB
});

// Both work:
await context.completion({ prompt: "..." });  // ✅ Blocking mode

await context.parallel.enable({ n_parallel: 4 });  // ✅ Can enable later
await context.parallel.completion({ prompt: "..." });  // ✅ Parallel mode

// Example 3: BAD - wastes memory
const context = await initLlama({
  model: 'model.gguf',
  n_parallel: 8,        // Default
  kv_unified: false,    // Default
});
// Memory: Model (5GB) + KV cache (8GB) = 13GB → Out of memory!
```

**Key Insight:**
- If you're ONLY using `completion()` (blocking mode), set `n_parallel: 1`
- If you MIGHT use `parallel.completion()`, set `n_parallel: 4-8` with `kv_unified: true`
- **Always set `kv_unified: true` on mobile** unless you have a very specific reason not to

This allows the parallel API to work while still using minimal memory.

---

## Quantization Types

Different quantization types have different compatibility and performance characteristics.

### Quantization Compatibility Matrix

| Quantization | iOS Metal | Android OpenCL | Android Hexagon | CPU | File Size (7B) | Quality |
|--------------|-----------|----------------|-----------------|-----|----------------|---------|
| **F16** | ✅ | ❌ | ✅ | ✅ | ~14 GB | Perfect |
| **Q8_0** | ✅ | ❌ | ✅ | ✅ | ~7 GB | Excellent |
| **Q6_K** | ✅ | ✅ | ✅ | ✅ | ~5.5 GB | Very good |
| **Q5_K_M** | ✅ | ❌ | ✅ | ✅ | ~4.8 GB | Very good |
| **Q5_K_S** | ✅ | ❌ | ✅ | ✅ | ~4.6 GB | Good |
| **Q4_K_M** | ✅ | ❌ | ✅ | ✅ | ~4.3 GB | Good |
| **Q4_K_S** | ✅ | ❌ | ✅ | ✅ | ~4.1 GB | Acceptable |
| **Q4_0** | ✅ | ✅ | ✅ | ✅ | ~3.9 GB | Acceptable |
| **Q3_K_L** | ✅ | ❌ | ✅ | ✅ | ~3.6 GB | Acceptable |
| **Q3_K_M** | ✅ | ❌ | ✅ | ✅ | ~3.3 GB | Fair |
| **Q2_K** | ✅ | ❌ | ✅ | ✅ | ~2.7 GB | Poor |

**Key:** ✅ Supported | ❌ Not supported

**⚠️ OpenCL Limitation:** Only Q4_0 and Q6_K are supported on Android OpenCL!

---

### Recommended Quantizations by Backend

#### iOS Metal
**Recommended:** Q4_K_M (best balance)

```typescript
// Best quality
model: 'llama-3-8b-q6_k.gguf'

// Best balance (recommended)
model: 'llama-3-8b-q4_k_m.gguf'

// Smallest size
model: 'llama-3-8b-q4_0.gguf'
```

**All quantizations work on Metal. Choose based on quality vs size tradeoff.**

---

#### Android OpenCL (Adreno GPU)
**Recommended:** Q4_0 (only option with Q6_K)

```typescript
// Only two options:
model: 'llama-3-8b-q6_k.gguf'   // Better quality, larger
model: 'llama-3-8b-q4_0.gguf'   // Smaller, recommended
```

**⚠️ Critical: Only Q4_0 and Q6_K work on OpenCL. Other quantizations will fall back to CPU!**

---

#### Android Hexagon (HTP NPU)
**Recommended:** Q4_K_M or Q4_0

```typescript
// All quantizations work, but smaller is better for NPU:
model: 'llama-3-8b-q4_k_m.gguf'  // Recommended
model: 'llama-3-8b-q4_0.gguf'    // Also good
```

**Hexagon works with all quantizations. Prefer Q4 for better NPU utilization.**

---

#### CPU (All Platforms)
**Recommended:** Q4_0 or Q3_K_M (smaller = faster)

```typescript
// CPU is slow, use smallest quantization:
model: 'llama-3-8b-q4_0.gguf'    // Recommended
model: 'llama-3-8b-q3_k_m.gguf'  // Even faster
```

**All quantizations work on CPU. Smaller is better (faster inference).**

---

### Quality Comparison

Visual quality ladder (7B models):

```
Excellent Quality:
├─ F16        ████████████████████ (14 GB, reference quality)
├─ Q8_0       ███████████████████▓ (7 GB, imperceptible loss)
└─ Q6_K       ██████████████████▓░ (5.5 GB, excellent)

Very Good Quality:
├─ Q5_K_M     ████████████████▓░░░ (4.8 GB)
└─ Q5_K_S     ████████████████░░░░ (4.6 GB)

Good Quality:
├─ Q4_K_M     ███████████████░░░░░ (4.3 GB) ⭐ Recommended for most
└─ Q4_K_S     ██████████████░░░░░░ (4.1 GB)

Acceptable Quality:
├─ Q4_0       █████████████░░░░░░░ (3.9 GB) ⭐ Recommended for OpenCL
└─ Q3_K_L     ████████████░░░░░░░░ (3.6 GB)

Fair/Poor Quality:
├─ Q3_K_M     ███████████░░░░░░░░░ (3.3 GB)
└─ Q2_K       █████████░░░░░░░░░░░ (2.7 GB)
```

---

## UI Configuration Guide

Recommendations for building a UI that lets users configure llama.rn.

### Default Values

**iOS:**
```typescript
const DEFAULT_CONFIG_IOS = {
  n_gpu_layers: 99,
  kv_unified: true,
  flash_attn_type: 'auto',
  n_ctx: 2048,
  n_batch: 512,
  // devices: undefined (auto-select)
};
```

**Android:**
```typescript
const DEFAULT_CONFIG_ANDROID = {
  n_gpu_layers: 99,
  kv_unified: true,
  flash_attn_type: 'off',
  n_ctx: 2048,
  n_batch: 512,
  // devices: undefined (auto-select)
};
```

---

### UI Component: Device Selection

#### iOS Device Selector

**Recommendation: Don't show device selector on iOS.**

Rationale:
- Only one GPU per device
- Auto-selection always correct
- Adds unnecessary complexity

**Alternative: Show detected GPU info (read-only)**

```typescript
// Display only, not selectable
const devices = await getBackendDevicesInfo();
const gpu = devices.find(d => d.type === 'gpu');

// Show to user:
// "GPU: Apple M2 (8 GB VRAM)"
```

---

#### Android Device Selector

**Recommendation: Show device selector with smart defaults.**

```typescript
async function getDeviceOptions() {
  const devices = await getBackendDevicesInfo();

  const options = [];

  // Option 1: Auto (recommended)
  options.push({
    id: 'auto',
    label: 'Auto (Recommended)',
    description: 'Automatically select best device',
    value: undefined,
    recommended: true,
  });

  // Option 2: Hexagon if available (experimental)
  const hexagonDevs = devices.filter(d => d.deviceName.startsWith('HTP'));
  if (hexagonDevs.length > 0) {
    options.push({
      id: 'hexagon',
      label: 'Hexagon NPU (Experimental)',
      description: 'Fastest, but may be unstable',
      value: ['HTP*'],
      tag: 'Fastest',
      experimental: true,
    });
  }

  // Option 3: GPU if available
  const gpuDev = devices.find(d => d.type === 'gpu');
  if (gpuDev) {
    options.push({
      id: 'gpu',
      label: `${gpuDev.deviceName} GPU`,
      description: 'Stable GPU acceleration',
      value: [gpuDev.deviceName],
      tag: 'Stable',
    });
  }

  // Option 4: CPU (always available)
  options.push({
    id: 'cpu',
    label: 'CPU Only',
    description: 'Slower, but works on all devices',
    value: undefined,
    gpuLayers: 0,
    tag: 'Compatible',
  });

  return options;
}
```

**UI Layout:**
```
┌─────────────────────────────────────────┐
│ Device Selection                        │
├─────────────────────────────────────────┤
│ ○ Auto (Recommended)                    │
│   Automatically select best device      │
│                                         │
│ ○ Hexagon NPU        [Fastest]  [Exp.] │
│   Fastest, but may be unstable          │
│                                         │
│ ○ Adreno 740 GPU              [Stable]  │
│   Stable GPU acceleration               │
│                                         │
│ ○ CPU Only                 [Compatible] │
│   Slower, but works on all devices      │
└─────────────────────────────────────────┘
```

---

### UI Component: Advanced Settings

#### Show/Hide Conditions

**Simple Mode (Default):**
- ✅ Model selection (with file picker)
- ✅ Device selection (Android only, auto-selected on iOS)
- ❌ Hide: n_gpu_layers, kv_unified, flash_attn_type (use defaults)

**Advanced Mode:**
- ✅ All parameters exposed
- ⚠️ Show warnings for non-default values

---

#### Parameter Visibility Rules

##### `n_gpu_layers`

**Show when:**
- Advanced mode enabled
- OR device is set to "CPU Only"

**UI:**
```
┌─────────────────────────────────────────┐
│ GPU Layers: [99  ] (default: 99)       │
│ ⓘ Number of layers to offload to GPU   │
│   99 = all layers (recommended)         │
└─────────────────────────────────────────┘
```

**Validation:**
- Min: 0
- Max: 99
- Default: 99

---

##### `kv_unified`

**Show when:**
- Advanced mode enabled

**UI:**
```
┌─────────────────────────────────────────┐
│ [✓] Unified KV Cache                    │
│ ⚠️ Disabling wastes ~7 GB memory        │
└─────────────────────────────────────────┘
```

**Default:** Always `true`

**Warning if unchecked:**
> ⚠️ Warning: Disabling unified KV cache will use ~8x more memory. Only disable if you need 8+ parallel conversations simultaneously.

---

##### `flash_attn_type`

**Show when:**
- iOS AND advanced mode
- (Always set to 'off' on Android, don't show)

**UI (iOS only):**
```
┌─────────────────────────────────────────┐
│ Flash Attention:                        │
│ ○ Auto (Recommended)                    │
│ ○ Enabled                               │
│ ○ Disabled                              │
└─────────────────────────────────────────┘
```

**Default:**
- iOS: `'auto'`
- Android: `'off'` (hidden, always set)

---

##### `n_ctx` - Context Length

**Show when:**
- Always (important parameter)

**UI:**
```
┌─────────────────────────────────────────┐
│ Context Length:                         │
│ ○ 512   (Short, ~256 MB)                │
│ ○ 1024  (Normal, ~512 MB)               │
│ ● 2048  (Long, ~1 GB) [Default]         │
│ ○ 4096  (Very Long, ~2 GB)              │
│ ○ 8192  (Maximum, ~4 GB)                │
└─────────────────────────────────────────┘
```

**Default:** `2048`

**Show memory estimate next to each option.**

---

##### `cache_type_k` / `cache_type_v`

**Show when:**
- Advanced mode AND low memory warning shown

**UI:**
```
┌─────────────────────────────────────────┐
│ KV Cache Quantization:                  │
│ ○ F16 (Default, 1024 MB)                │
│ ● Q8_0 (Recommended, 512 MB)            │
│ ○ Q4_0 (Minimum, 256 MB)                │
│                                         │
│ ⓘ Reduces memory with minimal quality   │
│   loss. Recommended for large models.   │
└─────────────────────────────────────────┘
```

**Default:** `undefined` (F16)

**Auto-suggest Q8_0 when:**
- Model size + estimated KV cache > 80% available RAM

---

### UI Component: Model Selection

#### Model Picker with Quantization Info

```
┌─────────────────────────────────────────┐
│ Model Selection                         │
├─────────────────────────────────────────┤
│ llama-3.2-1b-q4_k_m.gguf                │
│ Size: 0.8 GB | Quality: Good            │
│ Compatible: ✓ iOS  ✓ Android            │
│                                         │
│ llama-3.2-3b-q4_0.gguf                  │
│ Size: 1.9 GB | Quality: Acceptable      │
│ Compatible: ✓ iOS  ✓ Android (OpenCL)   │
│                                         │
│ llama-3.2-3b-q4_k_m.gguf                │
│ Size: 2.0 GB | Quality: Good            │
│ Compatible: ✓ iOS  ✓ Android (Hexagon)  │
│ ⚠️ Not compatible with OpenCL           │
│                                         │
│ llama-3-8b-q4_0.gguf                    │
│ Size: 4.3 GB | Quality: Acceptable      │
│ Compatible: ✓ iOS  ✓ Android (All)      │
└─────────────────────────────────────────┘
```

**Show compatibility badges based on:**
1. Selected device
2. Quantization type
3. Available memory

---

#### Quantization Validator

When user selects a model, validate against selected device:

```typescript
function validateModelForDevice(modelFile: string, device: string, backend: string) {
  const quant = detectQuantization(modelFile);

  // OpenCL only supports Q4_0 and Q6_K
  if (backend === 'OpenCL' && !['q4_0', 'q6_k'].includes(quant)) {
    return {
      valid: false,
      warning: `OpenCL only supports Q4_0 and Q6_K quantization. This model (${quant.toUpperCase()}) will fall back to CPU.`,
      suggestion: 'Choose a Q4_0 or Q6_K model, or select a different device.',
    };
  }

  return { valid: true };
}
```

**Show warning in UI:**
```
┌─────────────────────────────────────────┐
│ ⚠️ Compatibility Warning                │
│                                         │
│ The selected model (Q4_K_M) is not      │
│ compatible with Adreno GPU (OpenCL).    │
│                                         │
│ Recommendations:                        │
│ • Switch to Q4_0 or Q6_K model          │
│ • Select Hexagon NPU instead            │
│ • Use CPU (slower)                      │
│                                         │
│ [Change Model] [Change Device] [Ignore] │
└─────────────────────────────────────────┘
```

---

### UI Component: Memory Estimator

Show estimated memory usage before initialization:

```typescript
function estimateMemory(config: {
  modelSize: number,
  n_ctx: number,
  kv_unified: boolean,
  n_parallel: number,
  cache_type_k?: string,
  cache_type_v?: string,
}) {
  // Estimate based on model size and configuration
  const kvCacheSize = calculateKVCache(config);
  const total = config.modelSize + kvCacheSize;

  return {
    modelSize: config.modelSize,
    kvCacheSize,
    total,
    available: getAvailableMemory(),
    willFit: total < getAvailableMemory() * 0.8,
  };
}
```

**UI Display:**
```
┌─────────────────────────────────────────┐
│ Memory Estimate                         │
├─────────────────────────────────────────┤
│ Model:     4.3 GB                       │
│ KV Cache:  1.0 GB                       │
│ ────────────────                        │
│ Total:     5.3 GB                       │
│                                         │
│ Available: 6.2 GB                       │
│ ✓ Should fit in memory                  │
│                                         │
│ ████████████████████░░  85% used        │
└─────────────────────────────────────────┘
```

**Show warning if > 90% memory:**
```
┌─────────────────────────────────────────┐
│ ⚠️ Low Memory Warning                   │
│                                         │
│ This configuration uses 7.8 GB          │
│ but only 6.2 GB is available.           │
│                                         │
│ Suggestions:                            │
│ • Reduce context length (2048 → 1024)  │
│ • Enable KV cache quantization (Q8_0)  │
│ • Use smaller model                     │
└─────────────────────────────────────────┘
```

---

### Complete Configuration Flow

```
1. User opens model selector
   ↓
2. System detects devices with getBackendDevicesInfo()
   ↓
3. Show compatible models based on detected devices
   ↓
4. User selects model
   ↓
5. Validate quantization vs selected device
   ↓
6. Show memory estimate
   ↓
7. If memory OK → Initialize
   If memory warning → Suggest optimizations
   ↓
8. Initialize with generated config
```

---

### Preset Configurations

Provide preset buttons for common scenarios:

```
┌─────────────────────────────────────────┐
│ Quick Presets                           │
├─────────────────────────────────────────┤
│ [Maximum Performance]                   │
│ • All layers on GPU/NPU                 │
│ • 4K context                            │
│ • Best for: Flagship devices            │
│                                         │
│ [Balanced (Recommended)]                │
│ • Auto device selection                 │
│ • 2K context                            │
│ • Best for: Most devices                │
│                                         │
│ [Maximum Compatibility]                 │
│ • CPU only                              │
│ • 1K context                            │
│ • Best for: Older devices               │
│                                         │
│ [Custom]                                │
│ • Manual configuration                  │
└─────────────────────────────────────────┘
```

**Preset configs:**

```typescript
const PRESETS = {
  maxPerformance: {
    ios: {
      n_gpu_layers: 99,
      kv_unified: true,
      flash_attn_type: 'on',
      n_ctx: 4096,
      cache_type_k: 'f16',
      cache_type_v: 'f16',
    },
    android: {
      devices: ['HTP*'], // Try Hexagon first
      n_gpu_layers: 99,
      kv_unified: true,
      flash_attn_type: 'off',
      n_ctx: 4096,
    }
  },

  balanced: {
    ios: {
      n_gpu_layers: 99,
      kv_unified: true,
      n_ctx: 2048,
    },
    android: {
      n_gpu_layers: 99,
      kv_unified: true,
      flash_attn_type: 'off',
      n_ctx: 2048,
    }
  },

  compatible: {
    ios: {
      n_gpu_layers: 0,
      kv_unified: true,
      n_ctx: 1024,
      n_threads: 4,
    },
    android: {
      n_gpu_layers: 0,
      kv_unified: true,
      n_ctx: 1024,
      n_threads: 4,
    }
  },
};
```

---

## Troubleshooting

### Common Issues

#### Issue 1: Out of Memory

**Symptoms:**
- App crashes during initialization
- Error: "Failed to allocate KV cache"

**Solutions:**
1. Enable `kv_unified: true` (saves 7 GB!)
2. Reduce `n_ctx` (4096 → 2048 → 1024)
3. Enable KV cache quantization (`cache_type_k: 'q8_0'`)
4. Use smaller model
5. Lower `n_batch` (512 → 256)

---

#### Issue 2: OpenCL State Save/Load Fails

**Symptoms:**
- Error: "Cannot load state - kv_unified is not enabled"
- Error: "Cannot load state - flash_attn_type is not disabled"

**Solution:**
```typescript
const context = await initLlama({
  model: 'model-q4_0.gguf',
  kv_unified: true,        // REQUIRED
  flash_attn_type: 'off',  // REQUIRED
});
```

---

#### Issue 3: Model Too Slow on Android

**Symptoms:**
- < 5 tokens/sec on Android
- Model running on CPU despite GPU available

**Possible causes:**
1. Wrong quantization for OpenCL (not Q4_0 or Q6_K)
2. GPU not detected
3. `n_gpu_layers: 0`

**Solutions:**
```typescript
// Check devices
const devices = await getBackendDevicesInfo();
console.log('Available devices:', devices);

// Ensure Q4_0 or Q6_K for OpenCL
model: 'model-q4_0.gguf',  // Not q4_k_m!

// Ensure GPU layers enabled
n_gpu_layers: 99,
```

---

#### Issue 4: Hexagon Crashes

**Symptoms:**
- App crashes when using `devices: ['HTP*']`
- Native crash/SIGABRT

**Solutions:**
1. Hexagon is experimental - fall back to OpenCL
2. Try specific HTP session instead of wildcard: `devices: ['HTP73']`
3. Update to latest llama.rn version
4. Report issue with device model and crash log

---

#### Issue 5: Wrong Quantization for Device

**Symptoms:**
- Very slow on OpenCL despite Q4_K_M model
- Warning: "falling back to CPU"

**Cause:**
OpenCL only supports Q4_0 and Q6_K

**Solution:**
```typescript
// ❌ Wrong: Q4_K_M doesn't work on OpenCL
model: 'model-q4_k_m.gguf',

// ✅ Correct: Use Q4_0 or Q6_K
model: 'model-q4_0.gguf',  // or q6_k
```

---

### Platform-Specific Issues

#### iOS: Metal Not Working

**Check:**
1. Metal is available: `getBackendDevicesInfo()` should show Metal device
2. Not running on simulator with layers > 0
3. Model fits in VRAM

**Debug:**
```typescript
const devices = await getBackendDevicesInfo();
console.log('Devices:', devices);
// Should show Metal device

const context = await initLlama({
  model: 'model.gguf',
  n_gpu_layers: 99,
  verbose: true,  // Enable verbose logging
});
```

---

#### Android: GPU Not Detected

**Check:**
1. Device has Adreno 700+ GPU
2. OpenCL native library is loaded
3. Manifest has `<uses-native-library android:name="libOpenCL.so" />`

**Debug:**
```typescript
const devices = await getBackendDevicesInfo();
const hasGpu = devices.some(d => d.type === 'gpu');
console.log('Has GPU:', hasGpu);
console.log('Devices:', devices.map(d => d.deviceName));
```

---

### Performance Optimization

#### Slow Inference

**Checklist:**
1. ✅ GPU/NPU enabled (`n_gpu_layers: 99`)
2. ✅ Correct quantization for backend
3. ✅ `kv_unified: true` (reduces memory pressure)
4. ✅ Appropriate `n_batch` (512-2048)
5. ✅ Model size appropriate for device

**Benchmark:**
```typescript
// Enable benchmarking
const result = await context.bench({
  pp: 512,  // Prompt processing
  tg: 128,  // Text generation
  pl: 1,    // Parallel
  nr: 3,    // Repetitions
});

console.log('Tokens per second:', result.modelDesc);
// Should be 20-60 t/s on flagship mobile
```

---

## Summary

### iOS Best Practices

✅ **DO:**
- Use auto-select for devices (don't specify `devices`)
- Set `n_gpu_layers: 99` (all layers on Metal)
- Set `kv_unified: true` (saves 7 GB)
- Use any quantization (all work on Metal)
- Use `flash_attn_type: 'auto'` (default)

❌ **DON'T:**
- Specify `devices: ['Metal', 'CPU']` (splits layers unnecessarily)
- Specify `devices: ['Metal', 'BLAS']` (wrong, BLAS auto-added)
- Use `kv_unified: false` (wastes memory)
- Set `n_parallel > 1` without `kv_unified: true`

---

### Android Best Practices

✅ **DO:**
- Use `getBackendDevicesInfo()` to detect capabilities
- Set `kv_unified: true` (critical for memory)
- Set `flash_attn_type: 'off'` (required for OpenCL)
- Use Q4_0 or Q6_K for OpenCL GPU
- Let users choose between Hexagon (fast) and OpenCL (stable)

❌ **DON'T:**
- Use Q4_K_M or other quantizations with OpenCL
- Assume Hexagon is available (check first)
- Use `kv_unified: false` (wastes 7 GB)
- Force Hexagon on all devices (experimental)

---

### Universal Best Practices

✅ **DO:**
- Always set `kv_unified: true` on mobile
- Validate quantization vs backend compatibility
- Show memory estimates before initialization
- Provide graceful fallbacks (Hexagon → OpenCL → CPU)
- Use presets for common scenarios

❌ **DON'T:**
- Expose all parameters to non-technical users
- Use default `n_parallel: 8` without `kv_unified: true`
- Ignore memory constraints
- Skip device detection on Android

---

## Quick Reference

### Minimal Configs

**iOS (Default):**
```typescript
await initLlama({
  model: 'model.gguf',
  n_gpu_layers: 99,
  kv_unified: true,
});
```

**Android (OpenCL):**
```typescript
await initLlama({
  model: 'model-q4_0.gguf',
  n_gpu_layers: 99,
  kv_unified: true,
  flash_attn_type: 'off',
});
```

**Android (Hexagon):**
```typescript
await initLlama({
  model: 'model.gguf',
  devices: ['HTP*'],
  n_gpu_layers: 99,
  kv_unified: true,
  flash_attn_type: 'off',
});
```

---

### Parameter Quick Lookup

| Parameter | iOS Default | Android Default | Mobile Recommended |
|-----------|-------------|-----------------|-------------------|
| `devices` | `undefined` | `undefined` | `undefined` (iOS)<br>`detect` (Android) |
| `n_gpu_layers` | `0` | `0` | `99` |
| `kv_unified` | `false` | `false` | `true` ⭐ |
| `flash_attn_type` | `'auto'` | `'auto'` | `'auto'` (iOS)<br>`'off'` (Android) |
| `n_ctx` | `512` | `512` | `2048` |
| `n_parallel` | `8` | `8` | `8` (with kv_unified: true) |
| `n_batch` | `512` | `512` | `512` |

---

## Additional Resources

- [API Documentation](./API/README.md)
- [Main README](../README.md)
- [Example App](../example/)
- [llama.cpp Documentation](https://github.com/ggml-org/llama.cpp)
