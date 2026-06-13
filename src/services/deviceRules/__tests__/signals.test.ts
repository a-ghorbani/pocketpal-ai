import {Platform} from 'react-native';
import DeviceInfo from 'react-native-device-info';

import NativeHardwareInfo from '../../../specs/NativeHardwareInfo';
import {readDeviceSignals} from '../signals';

describe('readDeviceSignals', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValue(8 * 1e9);
  });

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', {value: originalOS});
  });

  it('reads ram + machine on iOS, no native cpu call', async () => {
    Object.defineProperty(Platform, 'OS', {value: 'ios'});
    (DeviceInfo.getDeviceId as jest.Mock).mockResolvedValue('iPhone14,2');

    const signals = await readDeviceSignals();

    expect(signals).toEqual({ramBytes: 8 * 1e9, machine: 'iPhone14,2'});
    expect(NativeHardwareInfo.getCPUInfo).not.toHaveBeenCalled();
  });

  it('reads ram + cpu signals on Android', async () => {
    Object.defineProperty(Platform, 'OS', {value: 'android'});
    (NativeHardwareInfo.getCPUInfo as jest.Mock).mockResolvedValue({
      cores: 8,
      socModel: 'Tensor G3',
      hardware: 'shiba',
      features: ['dotprod', 'i8mm'],
      maxFreqMhz: 2900,
    });

    const signals = await readDeviceSignals();

    expect(signals).toEqual({
      ramBytes: 8 * 1e9,
      socModel: 'Tensor G3',
      hardware: 'shiba',
      cpuFeatures: ['dotprod', 'i8mm'],
      maxFreqMhz: 2900,
    });
  });

  it('degrades to a ram floor when the total-memory read throws', async () => {
    Object.defineProperty(Platform, 'OS', {value: 'ios'});
    (DeviceInfo.getTotalMemory as jest.Mock).mockRejectedValue(
      new Error('mem boom'),
    );
    (DeviceInfo.getDeviceId as jest.Mock).mockResolvedValue('iPhone14,2');

    const signals = await readDeviceSignals();

    // A failing RAM read maps to a small non-zero floor (lowest band) rather
    // than rejecting, so presets never resolve to empty.
    expect(signals.ramBytes).toBeGreaterThan(0);
    expect(signals.ramBytes).toBeLessThan(3 * 1024 * 1024 * 1024);
  });

  it('degrades to ram-only when the native cpu read throws (Android)', async () => {
    Object.defineProperty(Platform, 'OS', {value: 'android'});
    (NativeHardwareInfo.getCPUInfo as jest.Mock).mockRejectedValue(
      new Error('boom'),
    );

    const signals = await readDeviceSignals();

    expect(signals).toEqual({ramBytes: 8 * 1e9});
  });
});
