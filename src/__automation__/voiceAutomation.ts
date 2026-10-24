import {Platform} from 'react-native';

import {observable, runInAction} from 'mobx';

import {ASR_TIERS, memoryBudget, readDeviceMemory} from '../services/asr';
import {TTS_ENGINE_RUNTIME_BYTES} from '../services/tts';
import {
  asrStore,
  chatSessionStore,
  modelStore,
  ttsStore,
  voiceModeStore,
} from '../store';
import type {VoiceError, VoicePhase} from '../store';
import {assistant, user} from '../utils/chat';
import type {MessageType} from '../utils/types';
import {clearVoiceTrace, dumpVoiceTrace} from '../utils/voiceTrace';

/**
 * E2E-only voice-mode driver. Forces the voice-mode stores into the states a
 * visual-capture spec needs, without a microphone, a paywall or a model that
 * happens to be tight on the test phone. Forced phases are inert: the session
 * controller starts the mic only on its own transitions. Mirrors
 * `asrAutomation`; the module is __E2E__-gated and dead-code-eliminated from
 * production.
 *
 * Marker string for the CI prod-bundle grep: VOICE_AUTOMATION_STATE.
 *
 * Commands (`pocketpal://voice?cmd=...`):
 *   unlock::on|off|plus the dev entitlement override; plus clears it so Plus decides
 *   gate::on|off        device tier inside or below the voice-mode gate
 *   state::listening|muted|thinking|speaking|error|bar|closed
 *   setup::incomplete|complete   in-use whisper tier not installed / installed
 *   memory::tight|wont-fit       the chat model's size for that band
 *   seed::spoken        a spoken question and answer in the current chat
 *   trace::dump         the voice trace, one event per line, into the
 *                       `voice-trace-result` element's label and
 *                       voice-trace.txt (iOS Documents, Android external files)
 *   trace::clear        empties the voice trace
 */
const VOICE_AUTOMATION_STATE = 'VOICE_AUTOMATION_STATE';
const VOICE_TRACE_FILE = 'voice-trace.txt';

/** The last `trace::dump`, rendered by `VoiceAdapter`. */
export const voiceTraceDump = observable.box('');

const STATES: Record<
  string,
  {
    phase: VoicePhase;
    micMuted?: boolean;
    lastError?: VoiceError;
    presentation?: 'full' | 'bar';
  }
> = {
  listening: {phase: 'listening'},
  muted: {phase: 'listening', micMuted: true},
  thinking: {phase: 'thinking'},
  speaking: {phase: 'speaking'},
  error: {phase: 'listening', lastError: 'reply_failed'},
  bar: {phase: 'listening', presentation: 'bar'},
  closed: {phase: 'closed'},
};

export async function runVoiceCommand(cmd: string): Promise<void> {
  console.log(`[${VOICE_AUTOMATION_STATE}] ${cmd}`);
  const [verb, arg] = cmd.split('::');
  if (verb === 'unlock') {
    voiceModeStore.setUnlockOverride(arg === 'plus' ? null : arg === 'on');
  } else if (verb === 'gate') {
    runInAction(() => {
      modelStore.deviceTier = arg === 'on' ? 'high' : 'low';
    });
  } else if (verb === 'state' && STATES[arg]) {
    const state = STATES[arg];
    runInAction(() => {
      voiceModeStore.phase = state.phase;
      voiceModeStore.micMuted = state.micMuted ?? false;
      voiceModeStore.lastError = state.lastError ?? null;
      voiceModeStore.presentation = state.presentation ?? 'full';
    });
  } else if (verb === 'setup') {
    runInAction(() => {
      asrStore.downloadStates[asrStore.selectedTier] =
        arg === 'complete' ? 'ready' : 'not_installed';
    });
  } else if (verb === 'memory') {
    await forceMemoryBand(arg === 'wont-fit');
  } else if (verb === 'seed' && arg === 'spoken') {
    await seedSpokenTurn();
  } else if (verb === 'trace' && arg === 'dump') {
    await dumpTrace();
  } else if (verb === 'trace' && arg === 'clear') {
    clearVoiceTrace();
    runInAction(() => voiceTraceDump.set(''));
  }
}

async function dumpTrace(): Promise<void> {
  const trace = dumpVoiceTrace();
  runInAction(() => voiceTraceDump.set(trace));
  const RNFS = require('@dr.pogodin/react-native-fs');
  const dir =
    Platform.OS === 'android'
      ? RNFS.ExternalDirectoryPath
      : RNFS.DocumentDirectoryPath;
  await RNFS.writeFile(`${dir}/${VOICE_TRACE_FILE}`, trace, 'utf8');
}

async function forceMemoryBand(wontFit: boolean): Promise<void> {
  const memory = await readDeviceMemory(modelStore);
  if (!memory) {
    return;
  }
  const budget = memoryBudget(memory);
  const stt = ASR_TIERS[asrStore.selectedTier].runtimeBytes;
  const engine = ttsStore.currentVoice?.engine;
  const tts =
    engine && engine !== 'system'
      ? TTS_ENGINE_RUNTIME_BYTES[engine]
      : TTS_ENGINE_RUNTIME_BYTES.supertonic;
  runInAction(() => {
    modelStore.loadedModelBytes = wontFit
      ? budget - stt + 1
      : budget - stt - tts / 2;
  });
}

async function seedSpokenTurn(): Promise<void> {
  const question: MessageType.Text = {
    author: user,
    createdAt: Date.now(),
    id: '',
    text: 'What is a good day trip from Lisbon?',
    type: 'text',
    metadata: {spoken: true},
  };
  const answer: MessageType.AssistantTurn = {
    author: assistant,
    createdAt: Date.now() + 1,
    id: '',
    type: 'assistant_turn',
    steps: [
      {
        content:
          'Sintra is a great pick. It has fairytale palaces and forest trails, and the train takes about forty minutes.',
      },
    ],
    metadata: {spoken: true, copyable: true},
  };
  await chatSessionStore.addMessageToCurrentSession(question);
  await chatSessionStore.addMessageToCurrentSession(answer);
}
