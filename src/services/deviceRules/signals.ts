import {Platform} from 'react-native';
import DeviceInfo from 'react-native-device-info';

import NativeHardwareInfo from '../../specs/NativeHardwareInfo';

import {DeviceSignals} from './types';

// Conservative RAM floor used when the native total-memory read fails. It maps
// to the lowest band on both platforms, so the classifier degrades to the low
// tier (a non-empty preset list) rather than producing an empty result.
const RAM_FLOOR_BYTES = 1 * 1024 * 1024 * 1024;

// Read the device signals the classifier needs, once. Missing native fields are
// tolerated (e.g. Android < S has no SOC_MODEL); the classifier degrades. A
// failing RAM read degrades to the floor so presets never resolve to empty.
export async function readDeviceSignals(): Promise<DeviceSignals> {
  let ramBytes: number;
  try {
    ramBytes = await DeviceInfo.getTotalMemory();
  } catch {
    ramBytes = RAM_FLOOR_BYTES;
  }

  if (Platform.OS === 'ios') {
    const machine = await DeviceInfo.getDeviceId();
    return {ramBytes, machine};
  }

  try {
    const cpu = await NativeHardwareInfo.getCPUInfo();
    return {
      ramBytes,
      socModel: cpu.socModel,
      hardware: cpu.hardware,
      cpuFeatures: cpu.features,
      maxFreqMhz: cpu.maxFreqMhz,
    };
  } catch {
    return {ramBytes};
  }
}
