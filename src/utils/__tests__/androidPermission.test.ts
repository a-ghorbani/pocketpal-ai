import {PermissionsAndroid, Platform} from 'react-native';

import {ensureNotificationPermission} from '../androidPermission';

jest.mock('react-native', () => ({
  Platform: {OS: 'android', Version: 34},
  Alert: {alert: jest.fn()},
  PermissionsAndroid: {
    PERMISSIONS: {
      POST_NOTIFICATIONS: 'android.permission.POST_NOTIFICATIONS',
      WRITE_EXTERNAL_STORAGE: 'android.permission.WRITE_EXTERNAL_STORAGE',
    },
    RESULTS: {GRANTED: 'granted', DENIED: 'denied'},
    check: jest.fn(),
    request: jest.fn(),
  },
}));

jest.mock('../../store', () => ({uiStore: {l10n: {}}}));

const check = PermissionsAndroid.check as jest.Mock;
const request = PermissionsAndroid.request as jest.Mock;

describe('ensureNotificationPermission', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Platform as any).OS = 'android';
    (Platform as any).Version = 34;
  });

  it('asks on Android 14 when not granted', async () => {
    check.mockResolvedValue(false);
    request.mockResolvedValue('granted');

    await ensureNotificationPermission();

    expect(request).toHaveBeenCalledWith(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
  });

  it('does not ask when already granted', async () => {
    check.mockResolvedValue(true);

    await ensureNotificationPermission();

    expect(request).not.toHaveBeenCalled();
  });

  it('does not ask below Android 14', async () => {
    (Platform as any).Version = 33;

    await ensureNotificationPermission();

    expect(check).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it('does not ask on iOS', async () => {
    (Platform as any).OS = 'ios';

    await ensureNotificationPermission();

    expect(check).not.toHaveBeenCalled();
  });

  it('swallows a failing request', async () => {
    check.mockResolvedValue(false);
    request.mockRejectedValue(new Error('no activity'));
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(ensureNotificationPermission()).resolves.toBeUndefined();
  });
});
