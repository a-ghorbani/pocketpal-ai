import {NativeModules} from 'react-native';

jest.mock('../../../../firebase.config', () => ({
  isFirebaseConfigured: jest.fn(),
}));

// Control PALSHUB_BASE_URL via a getter so we can flip it per-test without
// re-registering the mock.
let palsHubBaseUrl = '';
jest.mock('@env', () => ({
  get PALSHUB_BASE_URL() {
    return palsHubBaseUrl;
  },
}));

import {isFirebaseConfigured} from '../../../../firebase.config';
import {DependencyHealthService} from '../DependencyHealthService';

describe('DependencyHealthService', () => {
  let service: DependencyHealthService;

  beforeEach(() => {
    jest.clearAllMocks();
    (isFirebaseConfigured as jest.Mock).mockReturnValue(true);
    palsHubBaseUrl = '';
    delete (NativeModules as Record<string, unknown>).WhisperTranscribeModule;
    service = new DependencyHealthService();
  });

  describe('getStatus', () => {
    it('reports firebase configured when isFirebaseConfigured is true', () => {
      (isFirebaseConfigured as jest.Mock).mockReturnValue(true);
      expect(service.getStatus().firebase).toBe('configured');
    });

    it('reports firebase not_configured when isFirebaseConfigured is false', () => {
      (isFirebaseConfigured as jest.Mock).mockReturnValue(false);
      expect(service.getStatus().firebase).toBe('not_configured');
    });

    it('reports whisper native missing when the module is absent', () => {
      delete (NativeModules as Record<string, unknown>)
        .WhisperTranscribeModule;
      expect(service.getStatus().whisperNative).toBe('missing');
    });

    it('reports whisper native available when the module is present', () => {
      (NativeModules as Record<string, unknown>).WhisperTranscribeModule = {
        isModelLoaded: jest.fn(),
      };
      expect(service.getStatus().whisperNative).toBe('available');
    });

    it('reports palsHub unknown when PALSHUB_BASE_URL is empty', () => {
      palsHubBaseUrl = '';
      expect(service.getStatus().palsHub).toBe('unknown');
    });

    it('reports palsHub configured when PALSHUB_BASE_URL is set', () => {
      palsHubBaseUrl = 'https://palshub.ai';
      expect(service.getStatus().palsHub).toBe('configured');
    });

    it('aggregates all three statuses together', () => {
      (isFirebaseConfigured as jest.Mock).mockReturnValue(false);
      delete (NativeModules as Record<string, unknown>)
        .WhisperTranscribeModule;
      palsHubBaseUrl = '';
      expect(service.getStatus()).toEqual({
        firebase: 'not_configured',
        whisperNative: 'missing',
        palsHub: 'unknown',
      });
    });
  });

  describe('getSummary', () => {
    it('summarizes configured vs not configured states', () => {
      (isFirebaseConfigured as jest.Mock).mockReturnValue(false);
      (NativeModules as Record<string, unknown>).WhisperTranscribeModule = {};
      palsHubBaseUrl = 'https://palshub.ai';

      const summary = service.getSummary();
      expect(summary).toContain('Firebase: NOT CONFIGURED');
      expect(summary).toContain('Whisper native: OK');
      expect(summary).toContain('PalsHub: OK');
    });
  });
});
