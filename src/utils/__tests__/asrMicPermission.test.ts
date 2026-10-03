import {AppState, Platform} from 'react-native';
import {RESULTS, check, request, openSettings} from 'react-native-permissions';

import {ensureMicPermission, openMicSettings} from '../asrMicPermission';

const mockCheck = check as jest.Mock;
const mockRequest = request as jest.Mock;
const mockOpenSettings = openSettings as jest.Mock;

describe('ensureMicPermission', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns granted without prompting when already granted', async () => {
    mockCheck.mockResolvedValue(RESULTS.GRANTED);
    expect(await ensureMicPermission()).toBe('granted');
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('treats a limited grant as granted', async () => {
    mockCheck.mockResolvedValue(RESULTS.LIMITED);
    expect(await ensureMicPermission()).toBe('granted');
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('returns blocked without prompting when already blocked', async () => {
    mockCheck.mockResolvedValue(RESULTS.BLOCKED);
    expect(await ensureMicPermission()).toBe('blocked');
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('treats an unavailable permission as blocked', async () => {
    mockCheck.mockResolvedValue(RESULTS.UNAVAILABLE);
    expect(await ensureMicPermission()).toBe('blocked');
  });

  it('prompts and returns granted when the request is approved', async () => {
    mockCheck.mockResolvedValue(RESULTS.DENIED);
    mockRequest.mockResolvedValue(RESULTS.GRANTED);
    expect(await ensureMicPermission()).toBe('granted');
    expect(mockRequest).toHaveBeenCalled();
  });

  it('returns denied when the request is declined this time', async () => {
    mockCheck.mockResolvedValue(RESULTS.DENIED);
    mockRequest.mockResolvedValue(RESULTS.DENIED);
    expect(await ensureMicPermission()).toBe('denied');
  });

  it('returns blocked when the request comes back permanently denied', async () => {
    mockCheck.mockResolvedValue(RESULTS.DENIED);
    mockRequest.mockResolvedValue(RESULTS.BLOCKED);
    expect(await ensureMicPermission()).toBe('blocked');
  });

  it('returns denied when the permission API throws', async () => {
    mockCheck.mockRejectedValue(new Error('boom'));
    expect(await ensureMicPermission()).toBe('denied');
  });
});

describe('ensureMicPermission on Android', () => {
  const originalOS = Platform.OS;
  let appStateListener: ((state: string) => void) | undefined;
  const removeSubscription = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    Platform.OS = 'android';
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_type, listener) => {
        appStateListener = listener as (state: string) => void;
        return {remove: removeSubscription} as any;
      });
    mockCheck.mockResolvedValue(RESULTS.DENIED);
  });

  afterEach(() => {
    jest.useRealTimers();
    Platform.OS = originalOS;
    appStateListener = undefined;
  });

  it('returns blocked when no dialog appears and the request never settles', async () => {
    mockRequest.mockReturnValue(new Promise(() => {}));
    const pending = ensureMicPermission();
    await jest.advanceTimersByTimeAsync(1500);
    expect(await pending).toBe('blocked');
    expect(removeSubscription).toHaveBeenCalled();
  });

  it('waits for the answer while the system dialog is showing', async () => {
    let answer: (status: string) => void = () => {};
    mockRequest.mockReturnValue(
      new Promise(resolve => {
        answer = resolve;
      }),
    );
    const pending = ensureMicPermission();
    await jest.advanceTimersByTimeAsync(0);
    appStateListener?.('background');
    await jest.advanceTimersByTimeAsync(10_000);
    answer(RESULTS.GRANTED);
    expect(await pending).toBe('granted');
  });

  it('returns the request result when it settles before the window', async () => {
    mockRequest.mockResolvedValue(RESULTS.DENIED);
    expect(await ensureMicPermission()).toBe('denied');
    expect(removeSubscription).toHaveBeenCalled();
  });

  it('returns denied when the request rejects', async () => {
    mockRequest.mockRejectedValue(new Error('no activity'));
    expect(await ensureMicPermission()).toBe('denied');
  });
});

describe('openMicSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('opens the OS settings page', async () => {
    mockOpenSettings.mockResolvedValue(undefined);
    await openMicSettings();
    expect(mockOpenSettings).toHaveBeenCalled();
  });

  it('swallows an openSettings failure', async () => {
    mockOpenSettings.mockRejectedValue(new Error('no settings'));
    await expect(openMicSettings()).resolves.toBeUndefined();
  });
});
