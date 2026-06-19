import {runInAction} from 'mobx';

import {ASR_INSUFFICIENT_STORAGE} from '../services/asr';
import {asrStore} from '../store/ASRStore';

/**
 * E2E-only ASR driver. Forces the voice-input store into one of the
 * deterministic gate/install/error states a visual-capture spec needs, without
 * a real microphone or a ~260 MB model download (neither is drivable on a
 * simulator). Mirrors `ttsAutomation`; the whole module is __E2E__-gated and
 * dead-code-eliminated from production.
 *
 * Marker string for the CI prod-bundle grep: ASR_AUTOMATION_STATE.
 *
 * Commands (`pocketpal://asr?cmd=...`):
 *   state::ready          gate open + selected tier installed → mic at rest
 *   state::not-installed  gate open + no tier installed → setup affordance
 *   state::low-memory     device below RAM gate → toggle OFF + helper line
 *   state::error-capture  transcribe failure → composer error snackbar
 *   state::error-blocked  blocked permission → snackbar + open-Settings action
 *   state::error-disk     selected tier disk-blocked → Settings storage line
 */
const ASR_AUTOMATION_STATE = 'ASR_AUTOMATION_STATE';

export async function runAsrCommand(cmd: string): Promise<void> {
  console.log(`[${ASR_AUTOMATION_STATE}] ${cmd}`);
  if (cmd === 'state::ready') {
    forceState({meetsMemory: true, override: true, selectedTierReady: true});
    return;
  }
  if (cmd === 'state::not-installed') {
    forceState({meetsMemory: true, override: true, selectedTierReady: false});
    return;
  }
  if (cmd === 'state::low-memory') {
    forceState({meetsMemory: false, override: null, selectedTierReady: false});
    return;
  }
  if (cmd === 'state::error-capture') {
    forceState({meetsMemory: true, override: true, selectedTierReady: true});
    asrStore.setError('transcribe_failed');
    return;
  }
  if (cmd === 'state::error-blocked') {
    forceState({meetsMemory: true, override: true, selectedTierReady: true});
    asrStore.setError('permission_blocked');
    return;
  }
  if (cmd === 'state::error-disk') {
    forceState({meetsMemory: true, override: true, selectedTierReady: false});
    runInAction(() => {
      const tier = asrStore.selectedTier;
      asrStore.downloadStates[tier] = 'error';
      asrStore.downloadError[tier] = ASR_INSUFFICIENT_STORAGE;
      asrStore.freeDiskBytes = 50 * 1024 * 1024;
    });
    return;
  }
}

function forceState(opts: {
  meetsMemory: boolean;
  override: boolean | null;
  selectedTierReady: boolean;
}): void {
  runInAction(() => {
    asrStore.deviceMeetsMemory = opts.meetsMemory;
    asrStore.userASROverride = opts.override;
    asrStore.downloadStates[asrStore.selectedTier] = opts.selectedTierReady
      ? 'ready'
      : 'not_installed';
    asrStore.captureState = 'idle';
    asrStore.lastError = null;
  });
}
