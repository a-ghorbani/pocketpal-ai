jest.mock('mobx-persist-store', () => ({
  makePersistable: jest.fn().mockReturnValue(Promise.resolve()),
}));

import {ASR_INSUFFICIENT_STORAGE} from '../../services/asr';
import {asrStore} from '../../store/ASRStore';
import {runAsrCommand} from '../asrAutomation';

describe('runAsrCommand', () => {
  beforeEach(() => {
    asrStore.deviceMeetsMemory = false;
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

  it('state::low-memory → gate closed by device memory, override unset', async () => {
    await runAsrCommand('state::low-memory');

    expect(asrStore.deviceMeetsMemory).toBe(false);
    expect(asrStore.userASROverride).toBeNull();
    expect(asrStore.asrAvailable).toBe(false);
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
