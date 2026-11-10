jest.mock('mobx-persist-store', () => ({
  makePersistable: jest.fn().mockReturnValue(Promise.resolve()),
}));
jest.mock('../../store/ModelStore', () => ({
  modelStore: require('../../../__mocks__/stores/modelStore').mockModelStore,
}));

import {
  ASR_DEFAULT_TIER,
  ASR_INSUFFICIENT_STORAGE,
  ASR_TIER_ORDER,
} from '../../services/asr';
import {asrStore} from '../../store/ASRStore';
import {modelStore} from '../../store/ModelStore';
import {runAsrCommand} from '../asrAutomation';

describe('runAsrCommand', () => {
  beforeEach(() => {
    modelStore.deviceTier = 'high';
    asrStore.userASROverride = null;
    asrStore.selectedTier = ASR_DEFAULT_TIER;
    for (const tier of ASR_TIER_ORDER) {
      asrStore.downloadStates[tier] = 'not_installed';
      asrStore.downloadError[tier] = null;
    }
    asrStore.freeDiskBytes = null;
    asrStore.captureState = 'idle';
    asrStore.lastError = null;
  });

  it('state::ready → gate open + selected tier ready (mic at rest)', async () => {
    await runAsrCommand('state::ready');

    expect(asrStore.asrAvailable).toBe(true);
    expect(asrStore.isSelectedTierReady).toBe(true);
  });

  it('state::not-installed → gate open but selected tier not ready (setup)', async () => {
    await runAsrCommand('state::not-installed');

    expect(asrStore.asrAvailable).toBe(true);
    expect(asrStore.isSelectedTierReady).toBe(false);
  });

  it('state::unsupported → gate closed by device tier, override unset', async () => {
    await runAsrCommand('state::unsupported');

    expect(asrStore.deviceSupported).toBe(false);
    expect(asrStore.userASROverride).toBeNull();
    expect(asrStore.asrAvailable).toBe(false);
  });

  it('state::recording → recording bar with a waveform', async () => {
    await runAsrCommand('state::recording');

    expect(asrStore.isSelectedTierReady).toBe(true);
    expect(asrStore.captureState).toBe('recording');
    expect(asrStore.inputLevels.length).toBeGreaterThan(0);
  });

  it('state::transcribing → recording bar in its transcribing state', async () => {
    await runAsrCommand('state::transcribing');

    expect(asrStore.captureState).toBe('transcribing');
    expect(asrStore.waitingForChat).toBe(false);
  });

  it('state::waiting-chat → transcribing, waiting for the chat reply', async () => {
    await runAsrCommand('state::waiting-chat');

    expect(asrStore.captureState).toBe('transcribing');
    expect(asrStore.waitingForChat).toBe(true);
  });

  it('state::error-capture → composer transcribe-failed error', async () => {
    await runAsrCommand('state::error-capture');

    expect(asrStore.captureState).toBe('error');
    expect(asrStore.lastError).toBe('transcribe_failed');
  });

  it('state::error-blocked → blocked-permission error', async () => {
    await runAsrCommand('state::error-blocked');

    expect(asrStore.lastError).toBe('permission_blocked');
  });

  it('state::error-memory → insufficient-memory error', async () => {
    await runAsrCommand('state::error-memory');

    expect(asrStore.lastError).toBe('insufficient_memory');
  });

  it('state::error-disk → selected tier in disk-blocked download error', async () => {
    await runAsrCommand('state::error-disk');

    const tier = asrStore.selectedTier;
    expect(asrStore.downloadStates[tier]).toBe('error');
    expect(asrStore.downloadError[tier]).toBe(ASR_INSUFFICIENT_STORAGE);
    expect(asrStore.freeDiskBytes).toBeGreaterThan(0);
  });

  it('tiers::none → gate open, nothing installed, default tier selected', async () => {
    await runAsrCommand('tiers::small');
    await runAsrCommand('tiers::none');

    expect(asrStore.asrAvailable).toBe(true);
    expect(ASR_TIER_ORDER.map(t => asrStore.downloadStates[t])).toEqual([
      'not_installed',
      'not_installed',
      'not_installed',
    ]);
    expect(asrStore.selectedTier).toBe(ASR_DEFAULT_TIER);
  });

  it('tiers::<csv> → exactly the listed tiers ready, the first one selected', async () => {
    await runAsrCommand('tiers::small,base');

    expect(asrStore.asrAvailable).toBe(true);
    expect(asrStore.downloadStates).toEqual({
      base: 'ready',
      small: 'ready',
      'large-turbo': 'not_installed',
    });
    expect(asrStore.selectedTier).toBe('small');
  });

  it('tiers:: clears a forced disk error', async () => {
    await runAsrCommand('state::error-disk');
    await runAsrCommand('tiers::base,small,large-turbo');

    expect(asrStore.isSelectedTierReady).toBe(true);
    expect(Object.values(asrStore.downloadError)).toEqual([null, null, null]);
    expect(asrStore.selectedTier).toBe('base');
  });

  it('ignores an unrecognized command', async () => {
    await runAsrCommand('state::ready');
    await runAsrCommand('bogus::cmd');

    expect(asrStore.asrAvailable).toBe(true);
    expect(asrStore.isSelectedTierReady).toBe(true);
  });
});
