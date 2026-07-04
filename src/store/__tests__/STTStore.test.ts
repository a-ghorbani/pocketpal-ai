/**
 * STTStore tests.
 *
 * Tests the MobX state management for Speech-to-Text without
 * requiring the native modules (they're lazy-loaded and return
 * undefined in test environment).
 */

// Mock react-native
jest.mock('react-native', () => ({
  Platform: {OS: 'ios'},
  PermissionsAndroid: {
    PERMISSIONS: {RECORD_AUDIO: 'android.permission.RECORD_AUDIO'},
    RESULTS: {GRANTED: 'granted'},
    request: jest.fn().mockResolvedValue('granted'),
  },
  NativeEventEmitter: jest.fn().mockImplementation(() => ({
    addListener: jest.fn().mockReturnValue({remove: jest.fn()}),
  })),
}));

// Mock mobx-persist-store to avoid AsyncStorage during tests
jest.mock('mobx-persist-store', () => ({
  makePersistable: jest.fn().mockResolvedValue(undefined),
}));

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));

// Mock react-native-haptic-feedback
jest.mock('react-native-haptic-feedback', () => ({
  trigger: jest.fn(),
}));

import {sttStore} from '../STTStore';
import {sttRuntime} from '../../services/stt/sttRuntime';

// Mock sttRuntime
jest.mock('../../services/stt/sttRuntime', () => ({
  sttRuntime: {
    start: jest.fn(),
    stop: jest.fn(),
    cancel: jest.fn(),
    getIsActive: jest.fn().mockReturnValue(false),
    getActiveEngine: jest.fn().mockReturnValue(null),
  },
}));

describe('STTStore', () => {
  beforeEach(() => {
    // Reset store state
    sttStore.status = 'idle';
    sttStore.partialText = '';
    sttStore.finalText = '';
    sttStore.errorMessage = '';
    sttStore.enabled = true;
    sttStore.whisperModelLoaded = false;
    jest.clearAllMocks();
  });

  describe('initial state', () => {
    it('has idle status', () => {
      expect(sttStore.status).toBe('idle');
    });

    it('has empty partial text', () => {
      expect(sttStore.partialText).toBe('');
    });

    it('has empty final text', () => {
      expect(sttStore.finalText).toBe('');
    });

    it('is enabled by default', () => {
      expect(sttStore.enabled).toBe(true);
    });
  });

  describe('computed properties', () => {
    it('isListening returns true when status is listening', () => {
      sttStore.status = 'listening';
      expect(sttStore.isListening).toBe(true);
    });

    it('isListening returns false when status is idle', () => {
      sttStore.status = 'idle';
      expect(sttStore.isListening).toBe(false);
    });

    it('isSTTAvailable returns true when enabled', () => {
      sttStore.enabled = true;
      expect(sttStore.isSTTAvailable).toBe(true);
    });
  });

  describe('startListening', () => {
    it('calls sttRuntime.start with callbacks', async () => {
      await sttStore.startListening('en-US');

      expect(sttRuntime.start).toHaveBeenCalledWith(
        expect.objectContaining({
          onStart: expect.any(Function),
          onPartial: expect.any(Function),
          onResult: expect.any(Function),
          onError: expect.any(Function),
          onEnd: expect.any(Function),
        }),
        expect.objectContaining({
          language: 'en-US',
          enablePartial: true,
        }),
      );
    });

    it('sets status to listening', async () => {
      await sttStore.startListening();
      expect(sttStore.status).toBe('listening');
    });

    it('clears previous text', async () => {
      sttStore.partialText = 'old partial';
      sttStore.finalText = 'old final';
      await sttStore.startListening();
      expect(sttStore.partialText).toBe('');
      expect(sttStore.finalText).toBe('');
    });

    it('does nothing when disabled', async () => {
      sttStore.enabled = false;
      await sttStore.startListening();
      expect(sttRuntime.start).not.toHaveBeenCalled();
    });

    it('does nothing when already listening', async () => {
      sttStore.status = 'listening';
      (sttRuntime.start as jest.Mock).mockClear();
      await sttStore.startListening();
      expect(sttRuntime.start).not.toHaveBeenCalled();
    });

    it('updates partial text on onPartial callback', async () => {
      let capturedCallbacks: any;
      (sttRuntime.start as jest.Mock).mockImplementationOnce(
        (callbacks: any) => {
          capturedCallbacks = callbacks;
        },
      );

      await sttStore.startListening();
      capturedCallbacks.onPartial('hello world');
      expect(sttStore.partialText).toBe('hello world');
    });

    it('updates final text on onResult callback', async () => {
      let capturedCallbacks: any;
      (sttRuntime.start as jest.Mock).mockImplementationOnce(
        (callbacks: any) => {
          capturedCallbacks = callbacks;
        },
      );

      await sttStore.startListening();
      capturedCallbacks.onResult({text: 'final result'});
      expect(sttStore.finalText).toBe('final result');
      expect(sttStore.status).toBe('idle');
    });

    it('sets error on onError callback', async () => {
      let capturedCallbacks: any;
      (sttRuntime.start as jest.Mock).mockImplementationOnce(
        (callbacks: any) => {
          capturedCallbacks = callbacks;
        },
      );

      await sttStore.startListening();
      capturedCallbacks.onError(new Error('Test error'));
      expect(sttStore.status).toBe('error');
      expect(sttStore.errorMessage).toBe('Test error');
    });

    it('sets error when start throws', async () => {
      (sttRuntime.start as jest.Mock).mockRejectedValueOnce(
        new Error('Start failed'),
      );

      await sttStore.startListening();
      expect(sttStore.status).toBe('error');
      expect(sttStore.errorMessage).toBe('Start failed');
    });
  });

  describe('stopListening', () => {
    it('calls sttRuntime.stop', async () => {
      await sttStore.stopListening();
      expect(sttRuntime.stop).toHaveBeenCalled();
    });

    it('returns final text', async () => {
      sttStore.finalText = 'the result';
      const result = await sttStore.stopListening();
      expect(result).toBe('the result');
    });
  });

  describe('cancelListening', () => {
    it('calls sttRuntime.cancel', async () => {
      await sttStore.cancelListening();
      expect(sttRuntime.cancel).toHaveBeenCalled();
    });

    it('resets status to idle', async () => {
      sttStore.status = 'listening';
      await sttStore.cancelListening();
      expect(sttStore.status).toBe('idle');
    });

    it('clears partial text', async () => {
      sttStore.partialText = 'partial';
      await sttStore.cancelListening();
      expect(sttStore.partialText).toBe('');
    });
  });

  describe('toggleListening', () => {
    it('starts listening when idle', async () => {
      sttStore.status = 'idle';
      await sttStore.toggleListening('en');
      expect(sttRuntime.start).toHaveBeenCalled();
    });

    it('stops listening when listening', async () => {
      sttStore.status = 'listening';
      await sttStore.toggleListening();
      expect(sttRuntime.stop).toHaveBeenCalled();
      expect(sttRuntime.start).not.toHaveBeenCalled();
    });
  });

  describe('setEnabled', () => {
    it('updates enabled flag', () => {
      sttStore.setEnabled(false);
      expect(sttStore.enabled).toBe(false);
    });

    it('cancels listening when disabled during active session', () => {
      sttStore.status = 'listening';
      sttStore.setEnabled(false);
      expect(sttRuntime.cancel).toHaveBeenCalled();
    });

    it('does not cancel when not listening', () => {
      sttStore.status = 'idle';
      sttStore.setEnabled(false);
      expect(sttRuntime.cancel).not.toHaveBeenCalled();
    });
  });

  describe('setPreferredEngine', () => {
    it('updates preferred engine', () => {
      sttStore.setPreferredEngine('whisper');
      expect(sttStore.preferredEngine).toBe('whisper');
    });

    it('can set to null for auto-select', () => {
      sttStore.setPreferredEngine(null);
      expect(sttStore.preferredEngine).toBeNull();
    });
  });

  describe('setSetupSheetOpen', () => {
    it('updates setup sheet visibility', () => {
      sttStore.setSetupSheetOpen(true);
      expect(sttStore.isSetupSheetOpen).toBe(true);
    });
  });

  describe('clearText', () => {
    it('clears final and partial text', () => {
      sttStore.finalText = 'final';
      sttStore.partialText = 'partial';
      sttStore.clearText();
      expect(sttStore.finalText).toBe('');
      expect(sttStore.partialText).toBe('');
    });
  });

  describe('clearError', () => {
    it('resets error status to idle', () => {
      sttStore.status = 'error';
      sttStore.errorMessage = 'some error';
      sttStore.clearError();
      expect(sttStore.status).toBe('idle');
      expect(sttStore.errorMessage).toBe('');
    });

    it('does not change non-error status', () => {
      sttStore.status = 'listening';
      sttStore.clearError();
      expect(sttStore.status).toBe('listening');
    });
  });
});
