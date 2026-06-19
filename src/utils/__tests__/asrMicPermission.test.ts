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
