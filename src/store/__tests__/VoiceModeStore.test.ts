import {Platform} from 'react-native';
import {runInAction} from 'mobx';
import {makePersistable} from 'mobx-persist-store';

import {mockASRStore} from '../../../__mocks__/stores/asrStore';
import {mockModelStore} from '../../../__mocks__/stores/modelStore';
import {mockPurchaseStore} from '../../../__mocks__/stores/purchaseStore';
import {plusGate} from '../../services/plus/gate';

jest.mock('../ModelStore', () => ({
  modelStore: require('../../../__mocks__/stores/modelStore').mockModelStore,
}));

import {
  VoiceModeStore,
  voiceEntitlement,
  voiceModeStore,
} from '../VoiceModeStore';

describe('VoiceModeStore', () => {
  const defaultSource = voiceEntitlement.source;

  afterEach(() => {
    voiceEntitlement.register(defaultSource);
    voiceModeStore.setUnlockOverride(null);
    runInAction(() => {
      voiceModeStore.userVoiceModeOverride = null;
    });
    (global as any).__DEV__ = true;
    (global as any).__E2E__ = true;
  });

  it.each([
    ['android', 'flagship', true],
    ['android', 'high', true],
    ['android', 'mid', false],
    ['android', 'low', false],
    ['ios', 'flagship', true],
    ['ios', 'high', true],
    ['ios', 'mid', true],
    ['ios', 'low', false],
    ['ios', null, false],
  ] as const)('%s, device tier %s → supported %s', (os, tier, supported) => {
    const platform = Platform.OS;
    Platform.OS = os;
    runInAction(() => {
      mockModelStore.deviceTier = tier;
    });
    expect(voiceModeStore.supported).toBe(supported);
    Platform.OS = platform;
  });

  it.each([
    ['low', true, true],
    ['high', false, false],
    ['low', null, false],
    ['high', null, true],
  ] as const)(
    'Android tier %s with the Settings override %s → supported %s',
    (tier, override, supported) => {
      const platform = Platform.OS;
      Platform.OS = 'android';
      runInAction(() => {
        mockModelStore.deviceTier = tier;
      });
      if (override !== null) {
        voiceModeStore.setUserVoiceModeOverride(override);
      }
      expect(voiceModeStore.supported).toBe(supported);
      expect(voiceModeStore.deviceSupported).toBe(tier === 'high');
      Platform.OS = platform;
    },
  );

  it("keeps dictation's own, narrower gate", () => {
    const platform = Platform.OS;
    Platform.OS = 'ios';
    runInAction(() => {
      mockModelStore.deviceTier = 'mid';
    });
    expect(voiceModeStore.supported).toBe(true);
    expect(mockASRStore.deviceSupported).toBe(false);
    Platform.OS = platform;
  });

  it('is locked by default', () => {
    expect(voiceModeStore.isUnlocked).toBe(false);
  });

  it('the dev override unlocks the default source', () => {
    voiceModeStore.setUnlockOverride(true);
    expect(voiceModeStore.isUnlocked).toBe(true);
  });

  it('a registered source decides, and its paywall opens', () => {
    const source = {isUnlocked: () => true, openPaywall: jest.fn()};
    voiceEntitlement.register(source);

    expect(voiceModeStore.isUnlocked).toBe(true);
    const onUnlocked = jest.fn();
    voiceEntitlement.source.openPaywall({onUnlocked});
    expect(source.openPaywall).toHaveBeenCalledWith({onUnlocked});
  });

  it('unlocks with Plus', () => {
    runInAction(() => {
      mockPurchaseStore.plusUnlocked = true;
    });
    expect(voiceModeStore.isUnlocked).toBe(true);
    runInAction(() => {
      mockPurchaseStore.plusUnlocked = false;
    });
    expect(voiceModeStore.isUnlocked).toBe(false);
  });

  it('opens the Plus screen as its paywall', () => {
    const onUnlocked = jest.fn();
    voiceEntitlement.source.openPaywall({onUnlocked});
    expect(plusGate.request).toEqual({onUnlocked});
    runInAction(() => {
      plusGate.request = null;
    });
  });

  it('persists the Settings override, and the unlock override only in E2E builds', () => {
    (global as any).__DEV__ = true;
    (global as any).__E2E__ = false;
    const dev = new VoiceModeStore();
    expect(makePersistable).toHaveBeenCalledWith(
      dev,
      expect.objectContaining({properties: ['userVoiceModeOverride']}),
    );

    (global as any).__E2E__ = true;
    const e2e = new VoiceModeStore();
    expect(makePersistable).toHaveBeenCalledWith(
      e2e,
      expect.objectContaining({
        properties: ['userVoiceModeOverride', 'unlockOverride'],
      }),
    );
  });

  it('reports open and full-view states that change only when a session opens, closes or collapses', () => {
    const store = new VoiceModeStore();
    expect([store.isOpen, store.isFullViewOpen]).toEqual([false, false]);
    store.setPhase('listening');
    expect([store.isOpen, store.isFullViewOpen]).toEqual([true, true]);
    store.setPresentation('bar');
    expect([store.isOpen, store.isFullViewOpen]).toEqual([true, false]);
  });

  it('closing resets mute, presentation and the error', () => {
    const store = new VoiceModeStore();
    store.setPhase('listening');
    store.setMicMuted(true);
    store.setPresentation('bar');
    store.setLastError('reply_failed');

    store.setPhase('closed');

    expect(store.micMuted).toBe(false);
    expect(store.presentation).toBe('full');
    expect(store.lastError).toBeNull();
  });

  it('a phase change clears the error; the same phase keeps it', () => {
    const store = new VoiceModeStore();
    store.setPhase('listening');
    store.setLastError('transcribe_failed');
    store.setPhase('listening');
    expect(store.lastError).toBe('transcribe_failed');
    store.setPhase('transcribing');
    expect(store.lastError).toBeNull();
  });
});
