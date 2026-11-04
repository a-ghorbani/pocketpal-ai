import {Platform} from 'react-native';
import DeviceInfo from 'react-native-device-info';

import {readDeviceMemory} from '../deviceMemory';

describe('readDeviceMemory', () => {
  const platform = Platform.OS;
  afterEach(() => {
    Platform.OS = platform;
  });

  it('on iOS reads what was free before any load, not the largest load', async () => {
    Platform.OS = 'ios';
    (DeviceInfo.getTotalMemory as jest.Mock)
      .mockResolvedValueOnce(6e9)
      .mockResolvedValueOnce(6e9);
    const chatModel = {availableMemoryCeiling: 3e9, largestSuccessfulLoad: 4e9};
    await expect(readDeviceMemory(chatModel)).resolves.toEqual({
      os: 'ios',
      ceilingBytes: 3e9,
      totalBytes: 6e9,
    });
    await expect(readDeviceMemory({})).resolves.toEqual({
      os: 'ios',
      ceilingBytes: 0,
      totalBytes: 6e9,
    });
  });

  it('on iOS treats unreadable total RAM as unlimited', async () => {
    Platform.OS = 'ios';
    jest.spyOn(console, 'warn').mockImplementationOnce(() => {});
    (DeviceInfo.getTotalMemory as jest.Mock).mockRejectedValueOnce(
      new Error('unavailable'),
    );
    await expect(
      readDeviceMemory({availableMemoryCeiling: 4.2e9}),
    ).resolves.toEqual({os: 'ios', ceilingBytes: 4.2e9, totalBytes: Infinity});
  });

  it('on Android reads total RAM, or null when it cannot', async () => {
    Platform.OS = 'android';
    (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValueOnce(8e9);
    await expect(readDeviceMemory({})).resolves.toEqual({
      os: 'android',
      totalBytes: 8e9,
    });

    jest.spyOn(console, 'warn').mockImplementationOnce(() => {});
    (DeviceInfo.getTotalMemory as jest.Mock).mockRejectedValueOnce(
      new Error('unavailable'),
    );
    await expect(readDeviceMemory({})).resolves.toBeNull();
  });
});
