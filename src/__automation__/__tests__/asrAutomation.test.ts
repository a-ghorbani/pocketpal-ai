jest.mock('mobx-persist-store', () => ({
  makePersistable: jest.fn().mockReturnValue(Promise.resolve()),
}));

import {asrStore} from '../../store/ASRStore';
import {runAsrCommand} from '../asrAutomation';

describe('runAsrCommand', () => {
  beforeEach(() => {
    asrStore.deviceMeetsMemory = false;
    asrStore.userASROverride = null;
    asrStore.downloadStates[asrStore.selectedTier] = 'not_installed';
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

  it('ignores an unrecognized command', async () => {
    await runAsrCommand('state::ready');
    await runAsrCommand('bogus::cmd');

    expect(asrStore.asrAvailable).toBe(true);
    expect(asrStore.isSelectedTierReady).toBe(true);
  });
});
