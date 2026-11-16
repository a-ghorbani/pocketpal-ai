import {readFileSync} from 'fs';
import {join} from 'path';

// 16 kHz mono signed 16-bit little-endian PCM, as the recorder delivers it.
const read = (name: string) =>
  new Uint8Array(readFileSync(join(__dirname, 'asr', name)));

/** "And so my fellow Americans": the first 2.2 s of whisper.cpp's samples/jfk.wav. */
export const speechPcm = () => read('speech-and-so-my-fellow-americans.pcm');

/**
 * 3 s of a quiet room, recorded on a Galaxy S23 (Android 16) through
 * AudioRecord with the VOICE_RECOGNITION source at 16 kHz mono, the
 * recorder's settings.
 */
export const quietRoomPcm = () => read('quiet-room-galaxy-s23.pcm');
