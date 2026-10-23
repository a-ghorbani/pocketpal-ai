jest.mock('mobx-persist-store', () => ({
  makePersistable: jest.fn().mockReturnValue(Promise.resolve()),
}));
jest.mock('../../store/ModelStore', () => ({
  modelStore: require('../../../__mocks__/stores/modelStore').mockModelStore,
}));

import {ASR_INSUFFICIENT_STORAGE} from '../../services/asr';
import {asrStore} from '../../store/ASRStore';
import {modelStore} from '../../store/ModelStore';
import {runAsrCommand} from '../asrAutomation';

describe('runAsrCommand', () => {
  beforeEach(() => {
    modelStore.deviceTier = 'high';
    asrStore.userASROverride = null;
    asrStore.downloadStates[asrStore.selectedTier] = 'not_installed';
    asrStore.downloadError[asrStore.selectedTier] = null;
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

  it('ignores an unrecognized command', async () => {
    await runAsrCommand('state::ready');
    await runAsrCommand('bogus::cmd');

    expect(asrStore.asrAvailable).toBe(true);
    expect(asrStore.isSelectedTierReady).toBe(true);
  });
});
