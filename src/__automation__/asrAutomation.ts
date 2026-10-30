import {runInAction} from 'mobx';

import {
  ASR_DEFAULT_TIER,
  ASR_INSUFFICIENT_STORAGE,
  ASR_TIER_ORDER,
} from '../services/asr';
import type {AsrTier} from '../services/asr';
import {asrStore} from '../store/ASRStore';
import {modelStore} from '../store/ModelStore';

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
 *   state::unsupported    device tier below the gate → toggle OFF + helper
 *   state::recording      recording bar with a fixed speech-like waveform
 *   state::transcribing   recording bar in its transcribing state
 *   state::waiting-chat   transcribing, waiting for a CPU chat reply
 *   state::error-capture  transcribe failure → composer error snackbar
 *   state::error-blocked  blocked permission → snackbar + open-Settings action
 *   state::error-memory   whisper won't fit next to the chat model → snackbar
 *   state::error-disk     selected tier disk-blocked → Settings storage line
 *   tiers::none           gate open + no tier installed, default tier selected
 *   tiers::<csv>          gate open + exactly these tiers installed; the first
 *                         one listed is selected (tiers::small,base)
 */
const ASR_AUTOMATION_STATE = 'ASR_AUTOMATION_STATE';

// Two short phrases after a pause, so a capture shows silence and speech.
const WAVEFORM = [
  0, 0, 0, 0, 0.02, 0.05, 0.3, 0.7, 0.85, 0.6, 0.75, 0.9, 0.5, 0.2, 0.05, 0.02,
  0, 0, 0.03, 0.4, 0.8, 0.65, 0.9, 0.7, 0.35, 0.1, 0.02, 0, 0, 0,
];

export async function runAsrCommand(cmd: string): Promise<void> {
  console.log(`[${ASR_AUTOMATION_STATE}] ${cmd}`);
  if (cmd.startsWith('tiers::')) {
    forceInstalledTiers(cmd.slice('tiers::'.length));
    return;
  }
  if (cmd === 'state::ready') {
    forceState({override: true, selectedTierReady: true});
    return;
  }
  if (cmd === 'state::not-installed') {
    forceState({override: true, selectedTierReady: false});
    return;
  }
  if (cmd === 'state::unsupported') {
    forceState({override: null, selectedTierReady: false});
    runInAction(() => {
      modelStore.deviceTier = 'low';
    });
    return;
  }
  if (
    cmd === 'state::recording' ||
    cmd === 'state::transcribing' ||
    cmd === 'state::waiting-chat'
  ) {
    forceState({override: true, selectedTierReady: true});
    runInAction(() => {
      asrStore.captureState =
        cmd === 'state::recording' ? 'recording' : 'transcribing';
      asrStore.waitingForChat = cmd === 'state::waiting-chat';
      asrStore.inputLevels = WAVEFORM;
    });
    return;
  }
  if (cmd === 'state::error-capture') {
    forceState({override: true, selectedTierReady: true});
    asrStore.setError('transcribe_failed');
    return;
  }
  if (cmd === 'state::error-blocked') {
    forceState({override: true, selectedTierReady: true});
    asrStore.setError('permission_blocked');
    return;
  }
  if (cmd === 'state::error-memory') {
    forceState({override: true, selectedTierReady: true});
    asrStore.setError('insufficient_memory');
    return;
  }
  if (cmd === 'state::error-disk') {
    forceState({override: true, selectedTierReady: false});
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
  override: boolean | null;
  selectedTierReady: boolean;
}): void {
  runInAction(() => {
    asrStore.userASROverride = opts.override;
    asrStore.downloadStates[asrStore.selectedTier] = opts.selectedTierReady
      ? 'ready'
      : 'not_installed';
    asrStore.captureState = 'idle';
    asrStore.lastError = null;
    asrStore.waitingForChat = false;
  });
}

function forceInstalledTiers(csv: string): void {
  const installed = csv
    .split(',')
    .filter((tier): tier is AsrTier =>
      ASR_TIER_ORDER.includes(tier as AsrTier),
    );
  runInAction(() => {
    asrStore.userASROverride = true;
    for (const tier of ASR_TIER_ORDER) {
      asrStore.downloadStates[tier] = installed.includes(tier)
        ? 'ready'
        : 'not_installed';
      asrStore.downloadError[tier] = null;
    }
    asrStore.selectedTier = installed[0] ?? ASR_DEFAULT_TIER;
  });
}
