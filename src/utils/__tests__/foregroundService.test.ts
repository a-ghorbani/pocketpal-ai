/**
 * foregroundService.ts drives the Android run-in-progress notification.
 * These tests pin down the permission memory (ask once, never re-ask
 * after a settled answer), pass-through of start/update/stop, and that
 * a permission denial still starts the service.
 */

const mockRequest = jest.fn();

// jest/setup.ts globally mocks this wrapper (same treatment as
// keepAwake); these tests exercise the real implementation.
jest.dontMock('../foregroundService');

jest.mock('react-native', () => ({
  PermissionsAndroid: {
    request: (...args: unknown[]) => mockRequest(...args),
    RESULTS: {
      GRANTED: 'granted',
      DENIED: 'denied',
      NEVER_ASK_AGAIN: 'never_ask_again',
    },
  },
  Platform: {OS: 'android', Version: 34},
}));

jest.mock('../../specs/NativeForegroundService', () => ({
  __esModule: true,
  default: {
    start: jest.fn(),
    update: jest.fn(),
    stop: jest.fn(),
  },
}));

import {PermissionsAndroid} from 'react-native';

type Api = typeof import('../foregroundService');
type Native = typeof import('../../specs/NativeForegroundService').default;

/**
 * The wrapper keeps module-level permission state, so every test loads a
 * fresh instance. Inside isolateModules the jest.mock factories run
 * again, producing fresh native mocks - return them alongside the API.
 */
function loadFresh(): {api: Api; native: Native} {
  let api: Api | undefined;
  let native: Native | undefined;
  jest.isolateModules(() => {
    native = require('../../specs/NativeForegroundService').default;
    api = require('../foregroundService');
  });
  return {api: api!, native: native!};
}

const flush = () => new Promise<void>(resolve => setImmediate(resolve));

const RATIONALE = {
  title: 'Show run notifications?',
  message: 'A notification keeps a model run going.',
  button: 'Allow',
};

beforeEach(() => {
  mockRequest.mockReset();
});

describe('startForegroundRun', () => {
  it('asks for notification permission once, then starts the service', async () => {
    mockRequest.mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
    const {api, native} = loadFresh();

    api.startForegroundRun('Model', 'Thinking...', RATIONALE);
    await flush();

    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(mockRequest).toHaveBeenCalledWith(
      'android.permission.POST_NOTIFICATIONS',
      expect.objectContaining({title: RATIONALE.title}),
    );
    expect(native.start).toHaveBeenCalledWith('Model', 'Thinking...');

    // Second run within the same module instance: permission is
    // remembered, no second dialog.
    api.startForegroundRun('Model', 'Thinking...', RATIONALE);
    await flush();
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(native.start).toHaveBeenCalledTimes(2);
  });

  it('still starts the service when permission is denied', async () => {
    mockRequest.mockResolvedValue('never_ask_again');
    const {api, native} = loadFresh();

    api.startForegroundRun('Model', 'Thinking...', RATIONALE);
    await flush();

    expect(native.start).toHaveBeenCalledTimes(1);
  });

  it('starts the service even when the permission request throws', async () => {
    mockRequest.mockRejectedValue(new Error('no activity'));
    const {api, native} = loadFresh();

    api.startForegroundRun('Model', 'Thinking...', RATIONALE);
    await flush();

    expect(native.start).toHaveBeenCalledTimes(1);
  });
});

describe('update/stop pass-through', () => {
  it('forwards update and stop to the native module', () => {
    const {api, native} = loadFresh();
    api.updateForegroundRun('Step 2');
    api.stopForegroundRun();
    expect(native.update).toHaveBeenCalledWith('Step 2');
    expect(native.stop).toHaveBeenCalledTimes(1);
  });

  it('swallows native errors so a run is never killed by the notification', () => {
    const {api, native} = loadFresh();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    (native.update as jest.Mock).mockImplementation(() => {
      throw new Error('boom');
    });
    (native.stop as jest.Mock).mockImplementation(() => {
      throw new Error('boom');
    });
    expect(() => api.updateForegroundRun('x')).not.toThrow();
    expect(() => api.stopForegroundRun()).not.toThrow();
    warn.mockRestore();
  });
});
