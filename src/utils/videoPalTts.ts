import {ttsStore} from '../store';
import {randId} from './index';

/**
 * Per-cycle TTS session for Video Pals.
 *
 * TTS is a downstream consumer of text. It should work regardless of
 * whether the text was generated from text, image, or video input — so a
 * Video Pal's image-analysis completion is spoken through the same
 * streaming hooks (`onAssistantMessageStart` / `onAssistantMessageChunk` /
 * `onAssistantMessageComplete`) that text chats use. Each analysis cycle
 * is one "message": the store closes the prior cycle's stream (and audio)
 * when a new one opens, so only the latest description is spoken.
 *
 * The session feeds per-token deltas into the store's streaming handle,
 * which buffers on sentence boundaries — tokens are never synthesized
 * individually. The tail is flushed at completion in case the final
 * sentence lacks terminal punctuation.
 *
 * The store itself gates on availability / auto-speak / voice setup; the
 * caller only decides whether the Pal wants speech at all
 * (`pal.voiceEnabled !== false`).
 */
export class VideoPalTtsSession {
  private readonly messageId = `videopal-${randId()}`;
  private opened = false;
  private cancelled = false;
  private spokenText = '';

  constructor(private readonly speak: boolean) {}

  /** Per-token delta from the vision completion stream. */
  onToken(token: string) {
    if (this.cancelled || !this.speak || !token) {
      return;
    }
    if (!this.opened) {
      this.opened = true;
      ttsStore.onAssistantMessageStart(this.messageId);
    }
    ttsStore.onAssistantMessageChunk(this.messageId, token);
    this.spokenText += token;
  }

  /** Full completion text (or the accumulated deltas) at stream end. */
  onComplete(text?: string) {
    if (this.cancelled || !this.speak) {
      return;
    }
    // Finalize the streaming session (flushes the tail after the last
    // sentence boundary), or speak the full text via the replay path when
    // no stream ever opened.
    this.spokenText = text || this.spokenText;
    ttsStore.onAssistantMessageComplete(this.messageId, this.spokenText, {
      hadReasoning: false,
    });
  }

  /** Aborted / failed run — stop buffered audio instead of playing on. */
  onError() {
    if (this.cancelled) {
      return;
    }
    this.cancelled = true;
    if (!this.speak || this.spokenText.length === 0) {
      return;
    }
    ttsStore.stop('video_error').catch(err => {
      console.warn('[VideoPalTtsSession] stop on error failed:', err);
    });
  }
}
