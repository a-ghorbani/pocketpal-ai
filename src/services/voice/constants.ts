/**
 * A local model's voice reply holds its first speech chunk until the reply
 * settles or this long after the stream opens (ms). Synthesis next to a
 * decoding model roughly doubles time to first audio.
 */
export const VOICE_FIRST_CHUNK_HOLD_MS = 1500;

/** Silence after speech that ends an utterance (ms). */
export const VOICE_ENDPOINT_HANG_MS = 600;

/** Voice mode is locked until an entitlement source says otherwise. */
export const VOICE_MODE_UNLOCKED_DEFAULT = false;
