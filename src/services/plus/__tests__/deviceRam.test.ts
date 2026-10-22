import type * as DeviceRamModule from '../deviceRam';

const mockReadDeviceSignals = jest.fn();

jest.mock('../../deviceRules/signals', () => ({
  readDeviceSignals: () => mockReadDeviceSignals(),
}));

const freshModule = (): typeof DeviceRamModule => {
  let mod!: typeof DeviceRamModule;
  jest.isolateModules(() => {
    mod = require('../deviceRam');
  });
  return mod;
};

describe('device RAM read', () => {
  beforeEach(() => {
    mockReadDeviceSignals.mockReset();
  });

  it('is unknown until the read resolves', async () => {
    let answer!: (value: {ramBytes: number}) => void;
    mockReadDeviceSignals.mockReturnValue(
      new Promise(resolve => {
        answer = resolve;
      }),
    );
    const {deviceRam, ensureRamRead} = freshModule();

    const read = ensureRamRead();
    expect(deviceRam.ramBytes).toBeNull();

    answer({ramBytes: 8e9});
    await read;
    expect(deviceRam.ramBytes).toBe(8e9);
  });

  it('reads once per process', async () => {
    mockReadDeviceSignals.mockResolvedValue({ramBytes: 6e9});
    const {ensureRamRead} = freshModule();

    await ensureRamRead();
    await ensureRamRead();

    expect(mockReadDeviceSignals).toHaveBeenCalledTimes(1);
  });

  it('passes the floor value through when the native read failed', async () => {
    const floor = 1024 ** 3;
    mockReadDeviceSignals.mockResolvedValue({ramBytes: floor});
    const {deviceRam, ensureRamRead} = freshModule();

    await ensureRamRead();

    expect(deviceRam.ramBytes).toBe(floor);
  });
});
