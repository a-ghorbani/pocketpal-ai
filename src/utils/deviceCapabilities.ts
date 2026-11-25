import {Platform} from 'react-native';
import DeviceInfo from 'react-native-device-info';
import NativeHardwareInfo from '../specs/NativeHardwareInfo';
import type {CPUInfo, GPUInfo} from '../specs/NativeHardwareInfo';

/**
 * Device GPU capabilities result
 */
export interface GpuCapabilities {
  /** Whether GPU acceleration is supported on this device */
  isSupported: boolean;
  /** Reason why GPU is not supported (if applicable) */
  reason?:
    | 'ios_version'
    | 'no_adreno'
    | 'missing_cpu_features'
    | 'simulator'
    | 'unknown';
  /** Detailed information about missing requirements */
  details?: {
    hasAdreno?: boolean;
    hasI8mm?: boolean;
    hasDotProd?: boolean;
    iosVersion?: number;
    isSimulator?: boolean;
  };
}

/**
 * CPU information from the device
 */
export interface CpuInfo {
  cores: number;
  processors?: Array<{
    processor: string;
    'model name': string;
    'cpu MHz': string;
    vendor_id: string;
  }>;
  socModel?: string;
  features?: string[];
  hasFp16?: boolean;
  hasDotProd?: boolean;
  hasSve?: boolean;
  hasI8mm?: boolean;
  cpuMaxFreqsKhz?: number[];
  cpuCapacities?: number[];
}

/**
 * Check if the device supports GPU acceleration.
 *
 * Requirements:
 * - iOS: Requires iOS 18 or higher for Metal acceleration
 * - Android: Requires Adreno GPU + i8mm CPU feature + dotprod CPU feature for OpenCL
 *
 * @returns Promise<GpuCapabilities> GPU support status and details
 */
export async function checkGpuSupport(): Promise<GpuCapabilities> {
  // Check for simulator/emulator first - Metal residency sets not supported on simulators
  const isSimulator = await DeviceInfo.isEmulator();
  if (isSimulator) {
    return {
      isSupported: false,
      reason: 'simulator',
      details: {
        isSimulator: true,
      },
    };
  }

  if (Platform.OS === 'ios') {
    // iOS requires version 18 or higher for Metal acceleration
    const iosVersion = parseInt(Platform.Version as string, 10);
    const isSupported = iosVersion >= 18;

    return {
      isSupported,
      reason: isSupported ? undefined : 'ios_version',
      details: {
        iosVersion,
      },
    };
  } else if (Platform.OS === 'android') {
    // Android requires Adreno GPU + i8mm + dotprod CPU features for OpenCL
    try {
      const [gpuInfo, cpuInfo] = await Promise.all([
        NativeHardwareInfo.getGPUInfo(),
        NativeHardwareInfo.getCPUInfo(),
      ]);

      const hasAdreno = gpuInfo.hasAdreno ?? false;
      const hasI8mm = cpuInfo.hasI8mm ?? false;
      const hasDotProd = cpuInfo.hasDotProd ?? false;

      // All three conditions must be met for OpenCL support
      const isSupported = hasAdreno && hasI8mm && hasDotProd;

      let reason: GpuCapabilities['reason'];
      if (!isSupported) {
        if (!hasAdreno) {
          reason = 'no_adreno';
        } else if (!hasI8mm || !hasDotProd) {
          reason = 'missing_cpu_features';
        } else {
          reason = 'unknown';
        }
      }

      return {
        isSupported,
        reason,
        details: {
          hasAdreno,
          hasI8mm,
          hasDotProd,
        },
      };
    } catch (error) {
      console.warn('Failed to check GPU support:', error);
      return {
        isSupported: false,
        reason: 'unknown',
      };
    }
  }

  // Other platforms don't support GPU acceleration
  return {
    isSupported: false,
    reason: 'unknown',
  };
}

/**
 * Get CPU information from the device
 * @returns Promise<CpuInfo | null> CPU information or null if unavailable
 */
export async function getCpuInfo(): Promise<CpuInfo | null> {
  try {
    const info: CPUInfo = await NativeHardwareInfo.getCPUInfo();
    if (!info) {
      return null;
    }

    // On iOS, the native module returns minimal info
    if (Platform.OS === 'ios') {
      return {
        cores: info.cores || 0,
        processors: [],
        features: [],
        hasFp16: false,
        hasDotProd: false,
        hasSve: false,
        hasI8mm: false,
      };
    }

    // Map CPUInfo to CpuInfo, ensuring all fields are properly typed
    return {
      cores: info.cores,
      processors: (info.processors || []).map(p => ({
        processor: p.processor || '',
        'model name': p['model name'] || '',
        'cpu MHz': p['cpu MHz'] || '',
        vendor_id: p.vendor_id || '',
      })),
      socModel: info.socModel,
      features: info.features,
      hasFp16: info.hasFp16,
      hasDotProd: info.hasDotProd,
      hasSve: info.hasSve,
      hasI8mm: info.hasI8mm,
      cpuMaxFreqsKhz: info.cpuMaxFreqsKhz,
      cpuCapacities: info.cpuCapacities,
    };
  } catch (error) {
    console.warn('Failed to get CPU info:', error);
    return null;
  }
}

/**
 * Get the number of CPU cores
 * @returns Promise<number> Number of CPU cores (defaults to 4 if unavailable)
 */
export async function getCpuCoreCount(): Promise<number> {
  const cpuInfo = await getCpuInfo();
  return cpuInfo?.cores || 4; // fallback to 4
}

export function legacyThreadCount(cores: number): number {
  return cores <= 4 ? cores : Math.floor(cores * 0.8);
}

export interface ThreadDefault {
  threads: number;
  /** False when the core layout could not be read, so a later launch retries. */
  settled: boolean;
}

const MIN_FAST_CORES = 4;

const hasEntryPerCore = (
  values: number[] | undefined,
  cores: number,
): values is number[] =>
  values !== undefined &&
  values.length === cores &&
  cores > 0 &&
  values.every(value => value > 0);

/**
 * Fast cores are counted in llama.rn's pinning order (highest max frequency
 * first, ties to the higher index), so every thread it pins lands on one.
 */
export function resolveThreadDefault(
  cores: number,
  freqsKhz: number[] | undefined,
  capacities: number[] | undefined,
  platform: typeof Platform.OS,
): ThreadDefault {
  const legacy = legacyThreadCount(cores);
  if (platform !== 'android') {
    return {threads: legacy, settled: true};
  }
  if (!hasEntryPerCore(freqsKhz, cores)) {
    return {threads: legacy, settled: false};
  }
  const caps = hasEntryPerCore(capacities, cores) ? capacities : undefined;
  const maxCap = caps ? Math.max(...caps) : 0;

  const order = freqsKhz
    .map((freq, index) => ({freq, index}))
    .sort((a, b) => b.freq - a.freq || b.index - a.index);
  const maxFreq = order[0].freq;
  const firstSlow = order.findIndex(
    ({freq, index}) =>
      freq * 4 < maxFreq * 3 ||
      (caps !== undefined && caps[index] * 2 <= maxCap),
  );
  const fast = firstSlow === -1 ? cores : firstSlow;

  if (fast < MIN_FAST_CORES) {
    return {threads: legacy, settled: true};
  }
  return {threads: Math.min(fast, legacy), settled: true};
}

/**
 * Get the default thread count for this device (see `resolveThreadDefault`).
 * @returns Promise<number> Recommended thread count
 */
export async function getRecommendedThreadCount(): Promise<number> {
  const cpuInfo = await getCpuInfo();
  return resolveThreadDefault(
    cpuInfo?.cores || 4,
    cpuInfo?.cpuMaxFreqsKhz,
    cpuInfo?.cpuCapacities,
    Platform.OS,
  ).threads;
}

/**
 * Check if device is capable of running multimodal models
 * Requires high-end device with sufficient RAM and CPU cores
 * @returns Promise<boolean> True if device can handle multimodal models
 */
export async function isHighEndDevice(): Promise<boolean> {
  try {
    const ram = await DeviceInfo.getTotalMemory();
    const ramGB = ram / 1000 / 1000 / 1000;

    const cpuInfo = await getCpuInfo();
    const cpuCount = cpuInfo?.cores || 4;

    // Multimodal requirements (more stringent than regular models)
    const ramOK = ramGB >= 5.5; // 6GB minimum for multimodal
    const cpuOK = cpuCount >= 6; // 6+ cores for decent performance

    return ramOK && cpuOK;
  } catch (error) {
    console.error('High-end device check failed:', error);
    return false; // Conservative fallback
  }
}

/**
 * Get GPU information from the device
 * @returns Promise<GPUInfo | null> GPU information or null if unavailable
 */
export async function getGpuInfo(): Promise<GPUInfo | null> {
  try {
    const info = await NativeHardwareInfo.getGPUInfo();
    return info || null;
  } catch (error) {
    console.warn('Failed to get GPU info:', error);
    return null;
  }
}

/**
 * Get chipset information (Android only)
 * @returns Promise<string | null> Chipset name or null if unavailable/iOS
 */
export async function getChipsetInfo(): Promise<string | null> {
  if (Platform.OS !== 'android') {
    return null;
  }

  try {
    const chipset = await NativeHardwareInfo.getChipset?.();
    return chipset || null;
  } catch (error) {
    console.warn('Failed to get chipset info:', error);
    return null;
  }
}
