# llama.rn Upgrade Analysis & Implementation Plan

## Executive Summary

The llama.rn upgrade introduces a fundamental change in device selection: **`no_gpu_devices` is deprecated** in favor of a new `devices` parameter. This change provides more granular control over hardware acceleration but requires careful migration and UI design.

---

## 1. Current Implementation Analysis

### Current Parameters in Use

**File: [src/utils/types.ts](src/utils/types.ts)**
```typescript
export interface ContextInitParams {
  version: string;
  n_ctx: number;
  n_batch: number;
  n_ubatch: number;
  n_threads: number;
  flash_attn: boolean;
  cache_type_k: CacheType;
  cache_type_v: CacheType;
  n_gpu_layers: number;
  use_mlock: boolean;
  use_mmap: 'true' | 'false' | 'smart';
  no_gpu_devices: boolean;  // ⚠️ DEPRECATED - needs migration
}
```

### Current Usage Pattern

**File: [src/store/ModelStore.ts](src/store/ModelStore.ts:345-351)**
```typescript
n_gpu_layers: !this.contextInitParams.no_gpu_devices
  ? this.contextInitParams.n_gpu_layers
  : 0,
no_gpu_devices: this.contextInitParams.no_gpu_devices,
```

**Problem**: The current code sets `n_gpu_layers: 0` when `no_gpu_devices: true`, which is the OLD pattern. The NEW pattern uses the `devices` array instead.

---

## 2. New llama.rn Device Selection Model

### Key Changes from INITIALIZATION_GUIDE.md

#### The `devices` Parameter

**Type**: `string[] | undefined`

**Behavior**:
- `undefined` (recommended): Auto-selects the best available GPU/NPU
- `['Metal']` (iOS): Explicitly use Metal GPU
- `['Adreno (TM) 740']` (Android): Explicitly use specific GPU
- `['HTP*']` (Android): Use Hexagon NPU (experimental, Snapdragon 8 Gen 1+)
- `[]` or CPU-only: No GPU acceleration

#### Auto-Selection Logic

When `devices: undefined`:

**iOS**:
1. Scans backends (Metal, CPU, BLAS)
2. Filters by type: ✅ GPU (Metal) → added
3. ❌ CPU/ACCEL skipped (BLAS auto-added to runtime, not for layer placement)
4. Result: `model->devices = [Metal]`

**Android**:
1. Calls `get_filtered_default_devices()`
2. Scans backends: ✅ GPU (OpenCL/Adreno) → added if present
3. ❌ CPU → skipped
4. ❌ ACCEL (Hexagon) → **Explicitly excluded** (experimental)
5. Falls back to CPU if no GPU found

### Critical Insights

1. **`n_gpu_layers` is misleading**: It actually controls offloading to ANY device in `devices` array, not just GPU
2. **BLAS/ACCEL confusion**: BLAS (iOS) is auto-added to runtime, NOT for layer placement
3. **Hexagon NOT auto-selected**: Must explicitly use `devices: ['HTP*']`
4. **`kv_unified: true` is CRITICAL**: Saves ~7GB memory on mobile

---

## 3. Migration Strategy

### Phase 1: Add `devices` Parameter to Types

**File: src/utils/types.ts**

Add to `ContextInitParams`:
```typescript
export interface ContextInitParams {
  version: string;
  // ... existing fields ...

  // New field (replaces no_gpu_devices)
  devices?: string[];  // undefined = auto-select

  // Deprecated (keep for migration)
  no_gpu_devices?: boolean;
}
```

### Phase 2: Update Version & Migration Logic

**File: src/utils/contextInitParamsVersions.ts**

```typescript
// Increment version
export const CURRENT_CONTEXT_INIT_PARAMS_VERSION = '2.0';

export function migrateContextInitParams(
  params: ContextInitParams | LegacyContextInitParams | any,
): ContextInitParams {
  const migratedParams = {...params};

  // ... existing migrations ...

  // Migration from 1.0 to 2.0: no_gpu_devices → devices
  if (migratedParams.version === '1.0') {
    if ('no_gpu_devices' in migratedParams) {
      // Convert no_gpu_devices to devices format
      if (migratedParams.no_gpu_devices === true) {
        // GPU was disabled → don't set devices (will use CPU)
        migratedParams.devices = undefined;
        migratedParams.n_gpu_layers = 0;
      } else {
        // GPU was enabled → use auto-select
        migratedParams.devices = undefined;
        // Keep existing n_gpu_layers value
      }

      // Remove deprecated field
      delete migratedParams.no_gpu_devices;
    }

    migratedParams.version = '2.0';
  }

  return migratedParams as ContextInitParams;
}
```

### Phase 3: Update Default Context Init

**File: src/utils/contextInitParamsVersions.ts**

```typescript
export function createDefaultContextInitParams(): ContextInitParams {
  return {
    version: CURRENT_CONTEXT_INIT_PARAMS_VERSION,
    n_ctx: 2048,          // Increased from 1024 (per INITIALIZATION_GUIDE)
    n_batch: 512,
    n_ubatch: 512,
    n_threads: 4,
    flash_attn: Platform.OS === 'ios',  // iOS: auto, Android: off
    cache_type_k: 'f16',
    cache_type_v: 'f16',
    n_gpu_layers: 99,     // All layers (per INITIALIZATION_GUIDE)
    devices: undefined,    // Auto-select (NEW)
    use_mlock: false,
    use_mmap: Platform.OS === 'android' ? 'smart' : 'true',
    kv_unified: true,     // CRITICAL: saves 7GB (NEW - should add!)
    n_parallel: 1,        // App only uses blocking completion(), not parallel.completion()
  };
}
```

### Phase 4: Update ModelStore Initialization

**File: src/store/ModelStore.ts**

Replace `getEffectiveContextInitParams`:
```typescript
getEffectiveContextInitParams = async (
  filePath?: string,
): Promise<Omit<ContextParams, 'model'>> => {
  // Apply batch constraints
  const effectiveContext = this.contextInitParams.n_ctx;
  const effectiveBatch = Math.min(
    this.contextInitParams.n_batch,
    effectiveContext,
  );
  const effectiveUBatch = Math.min(
    this.contextInitParams.n_ubatch,
    effectiveBatch,
  );

  // Resolve use_mmap
  const currentUseMmap = this.contextInitParams.use_mmap;
  let effectiveUseMmap: boolean;

  if (currentUseMmap === 'smart') {
    effectiveUseMmap = filePath
      ? await resolveUseMmap('smart', filePath)
      : true;
  } else {
    effectiveUseMmap = currentUseMmap === 'true';
  }

  // Handle flash_attn_type (replaces flash_attn boolean)
  // Per INITIALIZATION_GUIDE:
  // - iOS: 'auto' (default, Metal supports it)
  // - Android: 'off' (required for OpenCL state save/load)
  const flash_attn_type: 'auto' | 'on' | 'off' =
    Platform.OS === 'ios'
      ? 'auto'
      : 'off';

  return {
    n_ctx: effectiveContext,
    n_batch: effectiveBatch,
    n_ubatch: effectiveUBatch,
    n_threads: this.contextInitParams.n_threads,
    flash_attn_type,  // NEW: replaces flash_attn boolean
    cache_type_k: this.contextInitParams.cache_type_k,
    cache_type_v: this.contextInitParams.cache_type_v,
    n_gpu_layers: this.contextInitParams.n_gpu_layers,
    devices: this.contextInitParams.devices,  // NEW
    kv_unified: this.contextInitParams.kv_unified ?? true,  // NEW (default true!)
    n_parallel: this.contextInitParams.n_parallel ?? 1,  // NEW (1 for blocking mode only)
    use_mlock: this.contextInitParams.use_mlock,
    use_mmap: effectiveUseMmap,
  };
};
```

### Phase 5: Remove no_gpu_devices References

**Files to update**:
- `src/store/ModelStore.ts:345-348` (remove no_gpu_devices logic)
- `src/store/ModelStore.ts:1121` (multimodal init - use devices instead)
- `src/store/ModelStore.ts:1531-1547` (GPU settings initialization)
- `src/screens/SettingsScreen/SettingsScreen.tsx` (UI updates - see Section 4)

---

## 4. UI/UX Recommendations

### Principle: Platform-Specific Complexity

**iOS**: Simple, auto-select only (no device picker)
**Android**: Device picker for GPU/Hexagon/CPU selection

### iOS Settings UI

**Recommendation: NO device selection UI**

Rationale (from INITIALIZATION_GUIDE):
- Only one GPU per device
- Auto-selection always correct
- Metal always available on iOS 18+
- Adds unnecessary complexity

**Current UI Elements to Keep**:
```
✅ n_gpu_layers (slider: 0-99)
✅ kv_unified (toggle) - ADD THIS!
✅ flash_attn_type (auto/on/off) - CHANGE from boolean
✅ n_ctx (dropdown: 512/1024/2048/4096/8192)
✅ cache_type_k/v (dropdown, only if flash_attn)
✅ n_threads (slider)
```

**Optional: Device Info Display (Read-only)**
```typescript
// Show detected GPU info (not selectable)
const devices = await getBackendDevicesInfo();
const gpu = devices.find(d => d.type === 'gpu');

// Display: "GPU: Apple M2 (6GB VRAM)"
```

### Android Settings UI

**Recommendation: Device Selection with Smart Defaults**

**UI Layout**:
```
┌─────────────────────────────────────────┐
│ Acceleration                            │
├─────────────────────────────────────────┤
│ ⦿ Auto (Recommended)                    │
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

**Implementation**:
```typescript
type DeviceOption = {
  id: 'auto' | 'hexagon' | 'gpu' | 'cpu';
  label: string;
  description: string;
  devices?: string[];  // undefined for auto, ['HTP*'] for hexagon, etc.
  n_gpu_layers: number;  // 0 for CPU, 99 for others
  tag?: 'Fastest' | 'Stable' | 'Compatible';
  experimental?: boolean;
};

async function getDeviceOptions(): Promise<DeviceOption[]> {
  const devices = await getBackendDevicesInfo();
  const options: DeviceOption[] = [];

  // Option 1: Auto (always available, recommended)
  options.push({
    id: 'auto',
    label: 'Auto (Recommended)',
    description: 'Automatically select best device',
    devices: undefined,
    n_gpu_layers: 99,
  });

  // Option 2: Hexagon if available
  const hexagonDevs = devices.filter(d => d.deviceName.startsWith('HTP'));
  if (hexagonDevs.length > 0) {
    options.push({
      id: 'hexagon',
      label: 'Hexagon NPU (Experimental)',
      description: 'Fastest, but may be unstable',
      devices: ['HTP*'],
      n_gpu_layers: 99,
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
      devices: [gpuDev.deviceName],
      n_gpu_layers: 99,
      tag: 'Stable',
    });
  }

  // Option 4: CPU (always available)
  options.push({
    id: 'cpu',
    label: 'CPU Only',
    description: 'Slower, but works on all devices',
    devices: undefined,
    n_gpu_layers: 0,
    tag: 'Compatible',
  });

  return options;
}
```

### Critical New UI Elements to Add

#### 1. kv_unified Toggle (CRITICAL!)

**Location**: Advanced Settings
**Default**: `true` (always on mobile)
**Warning if disabled**:
```
⚠️ Warning: Disabling unified KV cache will use ~8x more memory.
Only disable if you need 8+ parallel conversations simultaneously.
```

**Code**:
```typescript
<SettingsItem
  title="Unified KV Cache"
  description="Saves ~7GB memory by using a single KV cache stream"
  right={() => (
    <Switch
      value={modelStore.contextInitParams.kv_unified ?? true}
      onValueChange={(value) => {
        if (!value) {
          // Show warning
          Alert.alert(
            'High Memory Usage Warning',
            'Disabling unified KV cache will use ~8x more memory. Continue?',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Disable', onPress: () => modelStore.setKvUnified(false) }
            ]
          );
        } else {
          modelStore.setKvUnified(true);
        }
      }}
    />
  )}
/>
```

#### 2. flash_attn_type (Replace flash_attn boolean)

**Change from**: `boolean` (flash_attn)
**Change to**: `'auto' | 'on' | 'off'` (flash_attn_type)

**iOS UI**:
```
Flash Attention: [Auto (Recommended)] ▼
  - Auto (Recommended)
  - Enabled
  - Disabled
```

**Android UI**:
```
Flash Attention: Off (Required for OpenCL)
[Locked - cannot change on Android]
```

#### 3. n_parallel Slider (Optional, Advanced)

**Show when**: Advanced mode enabled
**Default**: 1 (app uses blocking completion only)
**Range**: 1-8
**Description**:
```
Maximum parallel sequences. Set to 1 since app only uses blocking completion().
Increasing this requires context reinitialization and only matters if using
the parallel.completion() API.
```

**Note**: For this app, this should generally remain at 1 and hidden from UI unless there's a future need for parallel completions.

---

## 5. Understanding n_parallel for This App

### Why n_parallel = 1?

This app uses **only blocking `completion()`**, NOT `parallel.completion()`.

From INITIALIZATION_GUIDE.md:
- **Mode 1 (Blocking)**: `n_parallel` is IGNORED for performance/memory (with `kv_unified: true`)
- **Mode 2 (Parallel)**: `n_parallel` sets max concurrent slots

### Memory Impact Analysis

With `kv_unified: true`:
```typescript
n_parallel: 1  → 1 logical slot,  1 stream  → 1GB KV cache
n_parallel: 8  → 8 logical slots, 1 stream  → 1GB KV cache (same!)
```

**So why use 1?**
- Reduces `n_seq_max` overhead in llama.cpp
- Slightly faster context initialization
- Makes intent clear: single-threaded completions only

### Trade-off

| Setting | Pros | Cons |
|---------|------|------|
| `n_parallel: 1` | ✅ Most efficient<br>✅ Clear intent<br>✅ Faster init | ❌ Cannot enable parallel mode later without reinitialization |
| `n_parallel: 8` | ✅ Future-proof for parallel mode | ❌ Slightly more overhead<br>❌ Misleading (suggests parallel support) |

**Decision**: Use `n_parallel: 1` since app architecture uses blocking completions only.

---

## 6. Best Practices by Platform

### iOS Recommended Config

```typescript
const IOS_RECOMMENDED_CONFIG: ContextInitParams = {
  version: '2.0',
  n_ctx: 2048,
  n_batch: 512,
  n_ubatch: 512,
  n_threads: 6,  // Will be set based on CPU cores
  flash_attn_type: 'auto',  // Metal supports it
  cache_type_k: 'f16',
  cache_type_v: 'f16',
  n_gpu_layers: 99,  // All layers on Metal
  devices: undefined,  // Auto-select Metal
  kv_unified: true,  // CRITICAL: saves 7GB
  n_parallel: 1,  // App only uses blocking completion(), not parallel.completion()
  use_mlock: false,
  use_mmap: 'true',
};
```

**When to adjust**:
- Large models (7B+): Consider `cache_type_k: 'q8_0', cache_type_v: 'q8_0'` to save 512MB
- Testing: Set `n_gpu_layers: 0` for CPU-only testing

### Android Recommended Config (Auto)

```typescript
const ANDROID_AUTO_CONFIG: ContextInitParams = {
  version: '2.0',
  n_ctx: 2048,
  n_batch: 512,
  n_ubatch: 512,
  n_threads: 4,  // Will be set based on CPU cores
  flash_attn_type: 'off',  // REQUIRED for OpenCL state save/load
  cache_type_k: 'f16',
  cache_type_v: 'f16',
  n_gpu_layers: 99,
  devices: undefined,  // Auto-select Adreno if available
  kv_unified: true,  // CRITICAL: saves 7GB
  n_parallel: 1,  // App only uses blocking completion(), not parallel.completion()
  use_mlock: false,
  use_mmap: 'smart',  // Smart choice for Android
};
```

### Android Hexagon Config (Experimental)

```typescript
const ANDROID_HEXAGON_CONFIG: ContextInitParams = {
  // Same as auto, but:
  devices: ['HTP*'],  // Use Hexagon NPU
  flash_attn_type: 'off',  // May be required
};
```

**Prerequisites**:
1. Device must have Snapdragon 8 Gen 1+ (SM8450+)
2. **Must add to AndroidManifest.xml**:
   ```xml
   <uses-native-library android:name="libcdsprpc.so" android:required="false" />
   ```

---

## 7. Quantization Compatibility Matrix

Per INITIALIZATION_GUIDE, OpenCL has strict quantization requirements:

| Quantization | iOS Metal | Android OpenCL | Android Hexagon | CPU |
|--------------|-----------|----------------|-----------------|-----|
| Q4_0         | ✅        | ✅             | ✅              | ✅  |
| Q6_K         | ✅        | ✅             | ✅              | ✅  |
| Q4_K_M       | ✅        | ❌             | ✅              | ✅  |
| Q5_K_M       | ✅        | ❌             | ✅              | ✅  |
| Q8_0         | ✅        | ❌             | ✅              | ✅  |

**Critical**: If user selects Adreno GPU + Q4_K_M model → **Will fall back to CPU!**

### Model Selection Validation

```typescript
function validateModelForDevice(
  modelFile: string,
  devices: string[] | undefined,
  isAndroid: boolean
): {valid: boolean; warning?: string} {
  const quant = detectQuantization(modelFile);

  // If using auto-select on Android, assume OpenCL might be used
  // If devices includes Adreno, definitely using OpenCL
  const mayUseOpenCL = isAndroid && (
    devices === undefined ||
    devices.some(d => d.includes('Adreno'))
  );

  if (mayUseOpenCL && !['q4_0', 'q6_k'].includes(quant.toLowerCase())) {
    return {
      valid: false,
      warning: `OpenCL only supports Q4_0 and Q6_K quantization. ` +
               `This model (${quant.toUpperCase()}) will fall back to CPU.\n\n` +
               `Recommendations:\n` +
               `• Switch to Q4_0 or Q6_K model\n` +
               `• Select Hexagon NPU instead\n` +
               `• Use CPU (slower)`
    };
  }

  return {valid: true};
}
```

---

## 8. Implementation Checklist

### Phase 1: Type Updates ✅
- [ ] Add `devices?: string[]` to `ContextInitParams`
- [ ] Add `kv_unified?: boolean` to `ContextInitParams`
- [ ] Add `n_parallel?: number` to `ContextInitParams`
- [ ] Change `flash_attn: boolean` → `flash_attn_type?: 'auto' | 'on' | 'off'`
- [ ] Mark `no_gpu_devices` as deprecated

### Phase 2: Migration Logic ✅
- [ ] Increment `CURRENT_CONTEXT_INIT_PARAMS_VERSION` to `'2.0'`
- [ ] Add migration from `no_gpu_devices` → `devices`
- [ ] Add migration from `flash_attn` → `flash_attn_type`
- [ ] Update `createDefaultContextInitParams()` with new defaults

### Phase 3: ModelStore Updates ✅
- [ ] Update `getEffectiveContextInitParams()` to use `devices`
- [ ] Remove `no_gpu_devices` logic
- [ ] Add `kv_unified` support
- [ ] Add `n_parallel` support
- [ ] Update multimodal init to use new parameters
- [ ] Remove GPU settings initialization (replace with device detection)

### Phase 4: Device Detection ✅
- [ ] Create `getBackendDevicesInfo()` wrapper (if not exists)
- [ ] Implement device option generation for Android
- [ ] Add quantization validation for OpenCL

### Phase 5: UI Updates ✅
- [ ] **iOS**: Remove device selection UI (use auto-select)
- [ ] **iOS**: Change flash_attn toggle → flash_attn_type dropdown
- [ ] **iOS**: Add kv_unified toggle (with warning)
- [ ] **Android**: Add device selection UI (Auto/Hexagon/GPU/CPU)
- [ ] **Android**: Lock flash_attn_type to 'off' (show why)
- [ ] **Android**: Add kv_unified toggle (with warning)
- [ ] Update n_ctx default to 2048 in UI
- [ ] Add model quantization validation warnings

### Phase 6: Settings Store Methods ✅
- [ ] Add `setDevices(devices: string[] | undefined)`
- [ ] Add `setKvUnified(kv_unified: boolean)`
- [ ] Add `setNParallel(n_parallel: number)`
- [ ] Change `setFlashAttn` → `setFlashAttnType(type: 'auto' | 'on' | 'off')`
- [ ] Remove `setNoGpuDevices` (deprecated)

### Phase 7: Testing ✅
- [ ] Test migration from v1.0 → v2.0
- [ ] Test iOS auto-select (should use Metal)
- [ ] Test Android auto-select (should use Adreno if available)
- [ ] Test Android Hexagon selection (on supported devices)
- [ ] Test quantization validation (OpenCL + Q4_K_M should warn)
- [ ] Test kv_unified memory savings
- [ ] Test backward compatibility with old configs

---

## 9. Breaking Changes Summary

### For End Users
- **No breaking changes**: Old configs will auto-migrate
- **Better defaults**: `kv_unified: true` saves 7GB memory
- **Android**: New device selection UI for better control

### For Developers
- **API change**: `no_gpu_devices` → `devices`
- **API change**: `flash_attn: boolean` → `flash_attn_type: 'auto' | 'on' | 'off'`
- **New required fields**: `kv_unified`, `n_parallel`
- **Version bump**: `1.0` → `2.0`

---

## 10. Memory Optimization Impact

### Before (v1.0)
```typescript
{
  n_gpu_layers: 99,
  no_gpu_devices: false,
  // No kv_unified → defaults to false
  // n_parallel: 8 (default)
}

// Memory: Model (5GB) + KV cache (8GB × 8 streams) = 69GB ❌ OUT OF MEMORY
```

### After (v2.0)
```typescript
{
  n_gpu_layers: 99,
  devices: undefined,  // Auto-select
  kv_unified: true,    // CRITICAL!
  n_parallel: 1,       // App only uses blocking completion()
}

// Memory: Model (5GB) + KV cache (1GB × 1 stream) = 6GB ✅ FITS
// Savings: 63GB (88% reduction!)
```

---

## 11. Recommended Reading Order

For implementation:
1. **Section 3**: Migration Strategy (Phase 1-5)
2. **Section 4**: UI/UX Recommendations
3. **Section 8**: Implementation Checklist
4. **Section 7**: Quantization Compatibility (for validation)

For understanding:
1. **Section 2**: New llama.rn Device Selection Model
2. **Section 5**: Understanding n_parallel for This App
3. **Section 6**: Best Practices by Platform
4. **Section 10**: Memory Optimization Impact

---

## Appendix: Quick Reference

### iOS: Minimal Config
```typescript
await initLlama({
  model: 'model.gguf',
  n_gpu_layers: 99,
  kv_unified: true,
});
```

### Android: Minimal Config (Auto)
```typescript
await initLlama({
  model: 'model-q4_0.gguf',  // Q4_0 or Q6_K for OpenCL!
  n_gpu_layers: 99,
  kv_unified: true,
  flash_attn_type: 'off',  // Required for OpenCL
});
```

### Android: Hexagon Config
```typescript
await initLlama({
  model: 'model.gguf',  // Any quantization
  devices: ['HTP*'],
  n_gpu_layers: 99,
  kv_unified: true,
  flash_attn_type: 'off',
});
```

---

**Document Version**: 1.1
**Last Updated**: 2025-11-30
**llama.rn Version**: Latest (with devices parameter)

**Changelog**:
- v1.1: Updated `n_parallel` from 8 to 1 (app uses blocking completion() only, not parallel.completion())
- v1.1: Added Section 5 explaining n_parallel decision for this app
- v1.0: Initial version
