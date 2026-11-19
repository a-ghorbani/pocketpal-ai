import {Platform} from 'react-native';

import NativeHardwareInfo from '../../specs/NativeHardwareInfo';
import {getRecommendedThreadCount} from '../deviceCapabilities';

describe('getRecommendedThreadCount', () => {
  const savedOS = Platform.OS;

  beforeEach(() => {
    Platform.OS = 'android';
  });

  afterEach(() => {
    Platform.OS = savedOS;
  });

  const mockCpu = (info: object) =>
    (NativeHardwareInfo.getCPUInfo as jest.Mock).mockResolvedValueOnce(info);

  it('uses the performance cores when the device reports them', async () => {
    mockCpu({cores: 8, performanceCores: 4});
    expect(await getRecommendedThreadCount()).toBe(4);
  });

  it('keeps 80% of the cores when performance cores are not reported', async () => {
    mockCpu({cores: 8});
    expect(await getRecommendedThreadCount()).toBe(6);
  });

  it('ignores a single performance core', async () => {
    mockCpu({cores: 8, performanceCores: 1});
    expect(await getRecommendedThreadCount()).toBe(6);
  });

  it('ignores a value that is not below the core count', async () => {
    mockCpu({cores: 8, performanceCores: 8});
    expect(await getRecommendedThreadCount()).toBe(6);
  });

  it('uses all cores on a 4-core device', async () => {
    mockCpu({cores: 4});
    expect(await getRecommendedThreadCount()).toBe(4);
  });

  it('ignores performance cores on iOS', async () => {
    Platform.OS = 'ios';
    mockCpu({cores: 6, performanceCores: 2});
    expect(await getRecommendedThreadCount()).toBe(4);
  });
});
