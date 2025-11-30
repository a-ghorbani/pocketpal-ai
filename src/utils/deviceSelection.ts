/**
 * Device selection utilities for llama.rn initialization
 * Provides platform-specific device options and quantization validation
 */

import {Platform} from 'react-native';
import {getBackendDevicesInfo, NativeBackendDeviceInfo} from 'llama.rn';

/**
 * Device option for UI selection
 */
export interface DeviceOption {
  id: 'auto' | 'gpu' | 'hexagon' | 'cpu';
  label: string;
  description: string;
  devices?: string[]; // undefined for auto-select or CPU
  n_gpu_layers: number;
  flash_attn_type: 'auto' | 'on' | 'off';
  tag?: 'Recommended' | 'Fastest' | 'Stable' | 'Compatible' | 'Experimental';
  experimental?: boolean;
  platform: 'ios' | 'android' | 'both';
  deviceInfo?: NativeBackendDeviceInfo; // Original device info from llama.rn
}

/**
 * Get available backend devices from llama.rn
 */
export async function getAvailableDevices(): Promise<
  NativeBackendDeviceInfo[]
> {
  try {
    const devices = await getBackendDevicesInfo();
    return devices || [];
  } catch (error) {
    console.warn('Failed to get backend devices info:', error);
    return [];
  }
}

/**
 * Get device selection options based on platform and available devices
 * @returns Array of device options for UI presentation
 */
export async function getDeviceOptions(): Promise<DeviceOption[]> {
  const options: DeviceOption[] = [];

  if (Platform.OS === 'ios') {
    // iOS: Simple auto-select only (Metal always available on iOS 18+)
    options.push({
      id: 'auto',
      label: 'Auto (Metal GPU)',
      description: 'Automatically uses Metal GPU acceleration',
      devices: undefined,
      n_gpu_layers: 99,
      flash_attn_type: 'auto',
      tag: 'Recommended',
      platform: 'ios',
    });

    // Optional: CPU-only for testing
    options.push({
      id: 'cpu',
      label: 'CPU Only',
      description: 'Use CPU only (slower, for testing)',
      devices: undefined,
      n_gpu_layers: 0,
      flash_attn_type: 'auto',
      tag: 'Compatible',
      platform: 'ios',
    });

    return options;
  }

  // Android: More complex options based on available devices
  const devices = await getAvailableDevices();

  // Option 1: Auto (always available, recommended)
  const hasGpu = devices.some(d => d.type === 'gpu');
  options.push({
    id: 'auto',
    label: 'Auto (Recommended)',
    description: hasGpu
      ? 'Automatically uses GPU if available'
      : 'Automatically selects best device',
    devices: undefined,
    n_gpu_layers: hasGpu ? 99 : 0,
    flash_attn_type: 'off',
    tag: 'Recommended',
    platform: 'android',
  });

  // Option 2: Hexagon NPU (if available)
  const hexagonDevs = devices.filter(d => d.deviceName?.startsWith('HTP'));
  if (hexagonDevs.length > 0) {
    options.push({
      id: 'hexagon',
      label: 'Hexagon NPU',
      description: 'Fastest, but experimental and may be unstable',
      devices: ['HTP*'], // Wildcard for all HTP devices
      n_gpu_layers: 99,
      flash_attn_type: 'off',
      tag: 'Fastest',
      experimental: true,
      platform: 'android',
      deviceInfo: hexagonDevs[0],
    });
  }

  // Option 3: GPU (if available)
  const gpuDev = devices.find(d => d.type === 'gpu');
  if (gpuDev) {
    options.push({
      id: 'gpu',
      label: `${gpuDev.deviceName || 'GPU'}`,
      description: 'Stable GPU acceleration (OpenCL)',
      devices: [gpuDev.deviceName!],
      n_gpu_layers: 99,
      flash_attn_type: 'off',
      tag: 'Stable',
      platform: 'android',
      deviceInfo: gpuDev,
    });
  }

  // Option 4: CPU (always available)
  options.push({
    id: 'cpu',
    label: 'CPU Only',
    description: 'Slower, but works on all devices',
    devices: undefined,
    n_gpu_layers: 0,
    flash_attn_type: 'off',
    tag: 'Compatible',
    platform: 'android',
  });

  return options;
}

/**
 * Detect quantization type from model filename
 * @param filename Model filename
 * @returns Quantization type (lowercase) or null if not detected
 */
export function detectQuantizationType(filename: string): string | null {
  const normalized = filename.toLowerCase();

  // Match quantization patterns
  const quantPatterns = [
    'f32',
    'f16',
    'q8_0',
    'q6_k',
    'q5_k_m',
    'q5_k_s',
    'q5_1',
    'q5_0',
    'q4_k_m',
    'q4_k_s',
    'q4_1',
    'q4_0',
    'q3_k_l',
    'q3_k_m',
    'q3_k_s',
    'q2_k',
    'iq4_nl',
  ];

  for (const pattern of quantPatterns) {
    if (normalized.includes(pattern)) {
      return pattern;
    }
  }

  return null;
}

/**
 * Validate model quantization compatibility with selected device
 * @param modelFilename Model filename
 * @param deviceOption Selected device option
 * @returns Validation result with warning if incompatible
 */
export function validateModelQuantizationForDevice(
  modelFilename: string,
  deviceOption: DeviceOption,
): {valid: boolean; warning?: string; recommendation?: string} {
  const quant = detectQuantizationType(modelFilename);

  if (!quant) {
    // Can't detect quantization, assume it's okay
    return {valid: true};
  }

  // iOS Metal: All quantizations supported
  if (Platform.OS === 'ios' && deviceOption.id !== 'cpu') {
    return {valid: true};
  }

  // Android: Check OpenCL compatibility
  if (Platform.OS === 'android') {
    // If using GPU (OpenCL) or Auto (which may use OpenCL)
    const mayUseOpenCL =
      deviceOption.id === 'gpu' ||
      (deviceOption.id === 'auto' && deviceOption.n_gpu_layers > 0);

    if (mayUseOpenCL) {
      // OpenCL ONLY supports Q4_0 and Q6_K
      const openclSupported = ['q4_0', 'q6_k'];

      if (!openclSupported.includes(quant)) {
        return {
          valid: false,
          warning:
            `OpenCL only supports Q4_0 and Q6_K quantization.\n\n` +
            `This model (${quant.toUpperCase()}) will fall back to CPU, ` +
            `resulting in very slow inference (~5-10 tokens/sec).`,
          recommendation:
            `Recommendations:\n` +
            `• Use a Q4_0 or Q6_K version of this model\n` +
            `• Switch to Hexagon NPU (if available)\n` +
            `• Use CPU only (slower but works)`,
        };
      }
    }

    // Hexagon: All quantizations supported
    // CPU: All quantizations supported
  }

  return {valid: true};
}

/**
 * Get platform-specific default device configuration
 */
export function getDefaultDeviceConfig(): {
  devices?: string[];
  n_gpu_layers: number;
  flash_attn_type: 'auto' | 'on' | 'off';
} {
  if (Platform.OS === 'ios') {
    return {
      devices: undefined, // Auto-select Metal
      n_gpu_layers: 99,
      flash_attn_type: 'auto',
    };
  } else {
    // Android
    return {
      devices: undefined, // Auto-select Adreno if available
      n_gpu_layers: 99,
      flash_attn_type: 'off', // Required for OpenCL
    };
  }
}

/**
 * Check if Hexagon HTP is available on this device
 */
export async function isHexagonAvailable(): Promise<boolean> {
  const devices = await getAvailableDevices();
  return devices.some(d => d.deviceName?.startsWith('HTP'));
}

/**
 * Check if GPU (OpenCL) is available on this device
 */
export async function isGpuAvailable(): Promise<boolean> {
  const devices = await getAvailableDevices();
  return devices.some(d => d.type === 'gpu');
}

/**
 * Get recommended device option ID based on platform and availability
 */
export async function getRecommendedDeviceId(): Promise<
  'auto' | 'gpu' | 'hexagon' | 'cpu'
> {
  // iOS: Always auto (Metal)
  if (Platform.OS === 'ios') {
    return 'auto';
  }

  // Android: Check availability
  const hasGpu = await isGpuAvailable();

  if (hasGpu) {
    return 'auto'; // Auto will use GPU (stable, recommended)
  }

  return 'cpu'; // Fallback to CPU
}
