import type {PermissionsAndroid as PermissionsAndroidType} from 'react-native';

jest.mock('react-native', () => ({
  Platform: {OS: 'android', Version: 34},
  Alert: {alert: jest.fn()},
  PermissionsAndroid: {
    PERMISSIONS: {
      POST_NOTIFICATIONS: 'android.permission.POST_NOTIFICATIONS',
      WRITE_EXTERNAL_STORAGE: 'android.permission.WRITE_EXTERNAL_STORAGE',
    },
    RESULTS: {
      GRANTED: 'granted',
      DENIED: 'denied',
      NEVER_ASK_AGAIN: 'never_ask_again',
    },
    check: jest.fn(),
    request: jest.fn(),
  },
}));

jest.mock('../../store', () => ({uiStore: {l10n: {}}}));

describe('ensureNotificationPermission', () => {
  let ensureNotificationPermission: () => Promise<void>;
  let platform: {OS: string; Version: number};
  let permissions: typeof PermissionsAndroidType;
  let check: jest.Mock;
  let request: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    const reactNative = require('react-native');
    platform = reactNative.Platform;
    permissions = reactNative.PermissionsAndroid;
    platform.OS = 'android';
    platform.Version = 34;
    check = permissions.check as jest.Mock;
    request = permissions.request as jest.Mock;
    check.mockReset();
    request.mockReset();
    ({ensureNotificationPermission} = require('../androidPermission'));
  });

  it('asks on Android 14 when not granted', async () => {
    check.mockResolvedValue(false);
    request.mockResolvedValue('granted');

    await ensureNotificationPermission();

    expect(request).toHaveBeenCalledWith(
      permissions.PERMISSIONS.POST_NOTIFICATIONS,
    );
  });

  it('does not ask when already granted', async () => {
    check.mockResolvedValue(true);

    await ensureNotificationPermission();

    expect(request).not.toHaveBeenCalled();
  });

  it.each(['denied', 'never_ask_again'])(
    'resolves when the user answers %s and does not ask again for a chained download',
    async answer => {
      check.mockResolvedValue(false);
      request.mockResolvedValue(answer);

      await expect(ensureNotificationPermission()).resolves.toBeUndefined();
      await ensureNotificationPermission();

      expect(request).toHaveBeenCalledTimes(1);
    },
  );

  it('asks once for downloads started together', async () => {
    check.mockResolvedValue(false);
    request.mockResolvedValue('denied');

    await Promise.all([
      ensureNotificationPermission(),
      ensureNotificationPermission(),
    ]);

    expect(request).toHaveBeenCalledTimes(1);
  });

  it('does not ask below Android 14', async () => {
    platform.Version = 33;

    await ensureNotificationPermission();

    expect(check).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it('does not ask on iOS', async () => {
    platform.OS = 'ios';

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
