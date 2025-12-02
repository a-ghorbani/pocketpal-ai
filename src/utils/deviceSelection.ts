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
  default_flash_attn_type: 'auto' | 'on' | 'off'; // Default/recommended flash attention setting
  valid_flash_attn_types: Array<'auto' | 'on' | 'off'>; // All valid flash attention values for this device
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
    // iOS: Three clear options

    // Option 1: Auto (devices: undefined, lets llama.cpp choose)
    // Metal supports all flash attention types
    options.push({
      id: 'auto',
      label: 'Auto',
      description: 'Automatically selects Metal GPU (Recommended)',
      devices: undefined,
      n_gpu_layers: 99,
      default_flash_attn_type: 'auto',
      valid_flash_attn_types: ['auto', 'on', 'off'],
      tag: 'Recommended',
      platform: 'ios',
    });

    // Option 2: Metal GPU (explicit devices: ['Metal'])
    // Metal supports all flash attention types
    options.push({
      id: 'gpu',
      label: 'Metal',
      description: 'Explicitly use Metal GPU acceleration',
      devices: ['Metal'],
      n_gpu_layers: 99,
      default_flash_attn_type: 'auto',
      valid_flash_attn_types: ['auto', 'on', 'off'],
      platform: 'ios',
    });

    // Option 3: CPU only (n_gpu_layers: 0)
    // CPU supports all flash attention types
    options.push({
      id: 'cpu',
      label: 'CPU',
      description: 'CPU only (slower, for testing or compatibility)',
      devices: ['CPU'],
      n_gpu_layers: 0,
      default_flash_attn_type: 'auto',
      valid_flash_attn_types: ['auto', 'on', 'off'],
      platform: 'ios',
    });

    return options;
  }

  // Android: Build options based on available devices
  const devices = await getAvailableDevices();
  const hexagonDevs = devices.filter(d => d.deviceName?.startsWith('HTP'));
  const hasHexagon = hexagonDevs.length > 0;
  const gpuDev = devices.find(d => d.type === 'gpu');

  // Option 1: CPU (always available, recommended for reliability)
  // CPU supports all flash attention types
  options.push({
    id: 'cpu',
    label: 'CPU',
    description: 'CPU only (Slowest, but works with all models)',
    devices: ['CPU'],
    n_gpu_layers: 0,
    default_flash_attn_type: 'off',
    valid_flash_attn_types: ['auto', 'on', 'off'], // CPU supports all
    tag: 'Recommended', // CPU is the recommended/default option for reliability
    platform: 'android',
  });

  // Option 2: GPU/OpenCL (if available)
  if (gpuDev) {
    // According to FLASH_ATTN.md Matrix 1: OpenCL only supports 'off' flash attention
    options.push({
      id: 'gpu',
      label: `GPU (OpenCL)`,
      description: 'OpenCL GPU acceleration (Only for Q4_0/Q6_K models)',
      devices: [gpuDev.deviceName!],
      n_gpu_layers: 99,
      default_flash_attn_type: 'off', // Required for OpenCL
      valid_flash_attn_types: ['off'], // OpenCL only supports 'off'
      tag: 'Fastest',
      platform: 'android',
      deviceInfo: gpuDev,
    });
  }

  // Option 3: Hexagon (if available)
  if (hasHexagon) {
    // Hexagon varies, but 'off' is safest
    // Conservative: only allow 'off' to avoid runtime errors
    options.push({
      id: 'hexagon',
      label: 'Hexagon',
      description: 'Qualcomm NPU (Experimental, fastest but may be unstable)',
      devices: ['HTP*'], // Wildcard for all HTP devices
      n_gpu_layers: 99,
      default_flash_attn_type: 'off',
      valid_flash_attn_types: ['off'], // Conservative: only 'off' is guaranteed safe
      tag: 'Experimental',
      experimental: true,
      platform: 'android',
      deviceInfo: hexagonDevs[0],
    });
  }

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
  default_flash_attn_type: 'auto' | 'on' | 'off';
} {
  if (Platform.OS === 'ios') {
    return {
      devices: undefined, // Auto-select Metal
      n_gpu_layers: 99,
      default_flash_attn_type: 'auto',
    };
  } else {
    // Android: Default to CPU for reliability
    return {
      devices: ['CPU'],
      n_gpu_layers: 0,
      default_flash_attn_type: 'off',
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

  // Android: Always recommend CPU for reliability
  // Users can manually choose GPU or Hexagon if they want to experiment
  return 'cpu';
}
