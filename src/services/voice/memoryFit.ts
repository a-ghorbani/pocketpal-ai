import {memoryBudget, whisperFits, type DeviceMemory} from '../asr/whisperFits';
import type {MemoryFitStatus} from '../../utils/memoryDisplay';

export interface VoiceMemoryInputs {
  /** null when the device memory could not be read. */
  memory: DeviceMemory | null;
  chatBytes: number;
  sttBytes: number;
  ttsBytes: number;
}

/** One model's share of `neededBytes`, as the platform's rule counts it. */
export interface VoiceMemoryRow {
  kind: 'chat' | 'stt' | 'tts';
  bytes: number;
}

export interface VoiceMemoryFit {
  status: MemoryFitStatus;
  breakdown: {
    /** Sums to `neededBytes`. */
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
}: VoiceMemoryInputs): VoiceMemoryFit => {
  if (!memory || (memory.os === 'ios' && memory.ceilingBytes === 0)) {
    return {
      status: 'fits',
      breakdown: {rows: [], neededBytes: 0, availableBytes: 0},
    };
  }
  const rows: VoiceMemoryRow[] = [
    {kind: 'chat', bytes: chatBytes},
    {kind: 'stt', bytes: sttBytes},
    {kind: 'tts', bytes: ttsBytes},
  ];
  const availableBytes = memoryBudget(memory);
  const neededBytes = rows.reduce((sum, row) => sum + row.bytes, 0);
  let status: MemoryFitStatus = 'fits';
  if (!whisperFits(memory, chatBytes, sttBytes)) {
    status = 'wont_fit';
  } else if (neededBytes > availableBytes) {
    status = 'tight';
  }
  return {status, breakdown: {rows, neededBytes, availableBytes}};
};
