import type {Tier} from '../deviceRules/types';
import type {EngineId} from '../tts/types';

/**
 * A local model's voice reply holds its first speech chunk until the reply
 * settles or this long after the stream opens (ms). Synthesis next to a
 * decoding model roughly doubles time to first audio.
 */
export const VOICE_FIRST_CHUNK_HOLD_MS = 1500;

/**
 * Engines whose voice reply starts at the first clause; every other engine
 * starts at the first sentence.
 */
export const VOICE_CLAUSE_FIRST_CHUNK_ENGINES: ReadonlySet<EngineId> = new Set([
  'kokoro',
  'supertonic',
]);

/**
 * Word cap on a clause first chunk, by device tier. An unresolved tier keeps
 * the speech library's default of 12.
 */
export const VOICE_FIRST_CHUNK_MAX_WORDS: Readonly<Record<Tier, number>> = {
  flagship: 24,
  high: 20,
  mid: 16,
  low: 12,
};

/** Silence after speech that ends an utterance (ms). */
export const VOICE_ENDPOINT_HANG_MS = 600;

/**
 * Wait after stopping the mic before starting it again (ms): three 50 ms
 * chunks. On Android the recorder's read thread releases the shared
 * recorder when it ends, so a restart sooner can lose the new recorder.
 */
export const VOICE_CAPTURE_SETTLE_MS = 150;

/**
 * A started mic that delivers no audio within this long (ms) is restarted
 * once, then voice mode ends. iOS reports a failed recorder start only in
 * its log. Bringing up a Bluetooth headset's mic route takes 1–3 s.
 */
export const VOICE_MIC_WATCHDOG_MS = 3000;

/**
 * Loading Whisper and the voice longer than this (ms) ends the start with a
 * warning. A first load on a mid-range phone took about 21 s.
 */
export const VOICE_START_TIMEOUT_MS = 45_000;
