const mockPlatform = {OS: 'android'};
const mockGetBackendDevicesInfo = jest.fn();

jest.mock('react-native', () => ({
  __esModule: true,
  Platform: mockPlatform,
  default: {
    Platform: mockPlatform,
  },
}));

jest.mock('llama.rn', () => ({
  getBackendDevicesInfo: () => mockGetBackendDevicesInfo(),
}));

import {
  detectQuantizationType,
  getAvailableDevices,
  getDefaultDeviceConfig,
  getDeviceOptions,
  getRecommendedDeviceId,
  isGpuAvailable,
  isHexagonAvailable,
  validateModelQuantizationForDevice,
} from '../deviceSelection';

describe('deviceSelection', () => {
  beforeEach(() => {
    mockPlatform.OS = 'android';
    mockGetBackendDevicesInfo.mockReset();
  });

  it('returns iOS device options without querying backend devices', async () => {
    mockPlatform.OS = 'ios';

    const options = await getDeviceOptions();

    expect(options.map(option => option.id)).toEqual(['auto', 'gpu', 'cpu']);
    expect(options[0].tag).toBe('Recommended');
    expect(mockGetBackendDevicesInfo).not.toHaveBeenCalled();
  });

  it('builds Android options based on available gpu and hexagon devices', async () => {
    mockGetBackendDevicesInfo.mockResolvedValue([
      {type: 'gpu', deviceName: 'Adreno GPU'},
      {type: 'npu', deviceName: 'HTP v75'},
    ]);

    const options = await getDeviceOptions();

    expect(options.map(option => option.id)).toEqual(['cpu', 'gpu', 'hexagon']);
    expect(options[1].devices).toEqual(['Adreno GPU']);
    expect(options[1].valid_flash_attn_types).toEqual(['off']);
    expect(options[2].experimental).toBe(true);
    expect(options[2].devices).toEqual(['HTP*']);
  });

  it('returns an empty device list when backend lookup fails', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockGetBackendDevicesInfo.mockRejectedValue(new Error('backend failed'));

    await expect(getAvailableDevices()).resolves.toEqual([]);
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('detects known quantization types and returns null for unknown names', () => {
    expect(detectQuantizationType('model-Q4_K_M.gguf')).toBe('q4_k_m');
    expect(detectQuantizationType('model-F16.gguf')).toBe('f16');
    expect(detectQuantizationType('model-unknown.gguf')).toBeNull();
  });

  it('allows all quantizations on iOS metal and cpu fallback paths', () => {
    mockPlatform.OS = 'ios';

    expect(
      validateModelQuantizationForDevice('model-q5_0.gguf', {
        id: 'gpu',
        label: 'Metal',
        description: '',
        n_gpu_layers: 0,
        default_flash_attn_type: 'on',
        valid_flash_attn_types: ['auto', 'on', 'off'],
        platform: 'ios',
      }),
    ).toEqual({valid: true});

    mockPlatform.OS = 'android';
    expect(
      validateModelQuantizationForDevice('model-q5_0.gguf', {
        id: 'cpu',
        label: 'CPU',
        description: '',
        n_gpu_layers: 0,
        default_flash_attn_type: 'on',
        valid_flash_attn_types: ['auto', 'on', 'off'],
        platform: 'android',
      }),
    ).toEqual({valid: true});
  });

  it('warns when Android OpenCL selection uses an unsupported quantization', () => {
    const result = validateModelQuantizationForDevice('model-q5_0.gguf', {
      id: 'gpu',
      label: 'GPU',
      description: '',
      n_gpu_layers: 0,
      default_flash_attn_type: 'off',
      valid_flash_attn_types: ['off'],
      platform: 'android',
    });

    expect(result.valid).toBe(false);
    expect(result.warning).toContain('OpenCL only supports Q4_0 and Q6_K');
    expect(result.recommendation).toContain('Q4_0');
  });

  it('allows supported Android OpenCL quantizations and unknown models', () => {
    expect(
      validateModelQuantizationForDevice('model-q6_k.gguf', {
        id: 'gpu',
        label: 'GPU',
        description: '',
        n_gpu_layers: 0,
        default_flash_attn_type: 'off',
        valid_flash_attn_types: ['off'],
        platform: 'android',
      }),
    ).toEqual({valid: true});

    expect(
      validateModelQuantizationForDevice('model-custom.gguf', {
        id: 'auto',
        label: 'Auto',
        description: '',
        n_gpu_layers: 99,
        default_flash_attn_type: 'auto',
        valid_flash_attn_types: ['auto', 'on', 'off'],
        platform: 'android',
      }),
    ).toEqual({valid: true});
  });

  it('returns platform-specific defaults and recommendations', async () => {
    expect(getDefaultDeviceConfig()).toEqual({
      devices: ['CPU'],
      n_gpu_layers: 0,
      default_flash_attn_type: 'on',
    });
    await expect(getRecommendedDeviceId()).resolves.toBe('cpu');

    mockPlatform.OS = 'ios';
    expect(getDefaultDeviceConfig()).toEqual({
      devices: undefined,
      n_gpu_layers: 0,
      default_flash_attn_type: 'on',
    });
    await expect(getRecommendedDeviceId()).resolves.toBe('auto');
  });

  it('detects hexagon and gpu availability from backend devices', async () => {
    mockGetBackendDevicesInfo.mockResolvedValue([
      {type: 'cpu', deviceName: 'CPU'},
      {type: 'gpu', deviceName: 'Adreno GPU'},
      {type: 'npu', deviceName: 'HTP v69'},
    ]);

    await expect(isGpuAvailable()).resolves.toBe(true);
    await expect(isHexagonAvailable()).resolves.toBe(true);

    mockGetBackendDevicesInfo.mockResolvedValue([
      {type: 'cpu', deviceName: 'CPU'},
    ]);

    await expect(isGpuAvailable()).resolves.toBe(false);
    await expect(isHexagonAvailable()).resolves.toBe(false);
  });
});
