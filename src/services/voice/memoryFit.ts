import {
  ASR_ANDROID_RAM_SHARE,
  ASR_IOS_MEMORY_HEADROOM_FACTOR,
} from '../asr/constants';
import {whisperFits, type DeviceMemory} from '../asr/whisperFits';
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

export interface VoiceMemoryFit {
  status: MemoryFitStatus;
  breakdown: {
    chatBytes: number;
    sttBytes: number;
    ttsBytes: number;
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
  const breakdown = {chatBytes, sttBytes, ttsBytes};
  if (!memory) {
    return {
      status: 'fits',
      breakdown: {...breakdown, neededBytes: 0, availableBytes: 0},
    };
  }
  let neededBytes: number;
  let availableBytes: number;
  if (memory.os === 'ios') {
    neededBytes =
      (sttBytes + (ttsLoaded ? 0 : ttsBytes)) * ASR_IOS_MEMORY_HEADROOM_FACTOR;
    availableBytes = memory.availableBytes;
  } else {
    neededBytes = chatBytes + sttBytes + ttsBytes;
    availableBytes = memory.totalBytes * ASR_ANDROID_RAM_SHARE;
  }
  let status: MemoryFitStatus = 'fits';
  if (!whisperFits(memory, chatBytes, sttBytes)) {
    status = 'wont_fit';
  } else if (neededBytes > availableBytes) {
    status = 'tight';
  }
  return {status, breakdown: {...breakdown, neededBytes, availableBytes}};
};
