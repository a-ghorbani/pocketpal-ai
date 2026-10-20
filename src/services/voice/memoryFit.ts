import {ASR_IOS_MEMORY_HEADROOM_FACTOR} from '../asr/constants';
import {
  androidMemoryBudget,
  whisperFits,
  type DeviceMemory,
} from '../asr/whisperFits';
import type {MemoryFitStatus} from '../../utils/memoryDisplay';

export interface VoiceMemoryInputs {
  /** null when the device memory could not be read. */
  memory: DeviceMemory | null;
  chatBytes: number;
  sttBytes: number;
  ttsBytes: number;
  /** The voice's engine is already loaded, so iOS memory reflects it. */
  ttsLoaded: boolean;
}

/** One model's share of `neededBytes`, as the platform's rule counts it. */
export interface VoiceMemoryRow {
  kind: 'chat' | 'stt' | 'tts';
  bytes: number;
}

export interface VoiceMemoryFit {
  status: MemoryFitStatus;
  breakdown: {
    /** Sums to `neededBytes`; iOS has no chat row (its figure already holds it). */
    rows: VoiceMemoryRow[];
    neededBytes: number;
    availableBytes: number;
  };
}

/**
 * Whether the chat model, whisper and the voice fit together. It won't fit
 * exactly where dictation would refuse whisper; it is tight when whisper
 * fits but the voice engine does not.
 */
export const voiceMemoryFit = ({
  memory,
  chatBytes,
  sttBytes,
  ttsBytes,
  ttsLoaded,
}: VoiceMemoryInputs): VoiceMemoryFit => {
  if (!memory) {
    return {
      status: 'fits',
      breakdown: {rows: [], neededBytes: 0, availableBytes: 0},
    };
  }
  let rows: VoiceMemoryRow[];
  let availableBytes: number;
  if (memory.os === 'ios') {
    const factor = ASR_IOS_MEMORY_HEADROOM_FACTOR;
    rows = [
      {kind: 'stt', bytes: sttBytes * factor},
      {kind: 'tts', bytes: ttsLoaded ? 0 : ttsBytes * factor},
    ];
    availableBytes = memory.availableBytes;
  } else {
    rows = [
      {kind: 'chat', bytes: chatBytes},
      {kind: 'stt', bytes: sttBytes},
      {kind: 'tts', bytes: ttsBytes},
    ];
    availableBytes = androidMemoryBudget(memory.totalBytes);
  }
  const neededBytes = rows.reduce((sum, row) => sum + row.bytes, 0);
  let status: MemoryFitStatus = 'fits';
  if (!whisperFits(memory, chatBytes, sttBytes)) {
    status = 'wont_fit';
  } else if (neededBytes > availableBytes) {
    status = 'tight';
  }
  return {status, breakdown: {rows, neededBytes, availableBytes}};
};
