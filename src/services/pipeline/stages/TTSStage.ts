/**
 * TTSStage — converts the analysis response to speech.
 *
 * Runs only if there is a `response` to synthesize and a TTS voice is
 * available. Produces an audioUri on the context.
 *
 * This implements the "TTS 输出" leg of the v1.27.0 pipeline. The stage
 * is optional — it's skipped by default unless enableTTS is set in the
 * pipeline config.
 *
 * Note: the TTS Engine interface (`src/services/tts/types.ts`) plays
 * audio directly via the native speech module and does not return a URI.
 * This stage therefore wraps the play() call and records that TTS ran
 * in metadata; a future native module may produce a file URI instead.
 */

import type {Engine as TTSEngine, Voice} from '../../tts/types';
import type {PipelineStage, PipelineContext} from '../types';

export class TTSStage implements PipelineStage {
  readonly name = 'tts';
  private ttsEngine: TTSEngine;
  private voice?: Voice;

  constructor(ttsEngine: TTSEngine, voice?: Voice) {
    this.ttsEngine = ttsEngine;
    this.voice = voice;
  }

  /** Skip if there's no response to synthesize. */
  condition(ctx: PipelineContext): boolean {
    return !!ctx.response && ctx.response.trim().length > 0;
  }

  async execute(ctx: PipelineContext): Promise<PipelineContext> {
    // Pick a voice — caller may have supplied one, otherwise let the
    // engine pick its default by passing an explicit fallback voice.
    if (this.voice) {
      await this.ttsEngine.play(ctx.response!, this.voice);
    } else {
      // No explicit voice — list available and pick the first.
      const voices = await this.ttsEngine.getVoices();
      if (voices.length === 0) {
        throw new Error('No TTS voices available');
      }
      await this.ttsEngine.play(ctx.response!, voices[0]);
    }

    return {
      ...ctx,
      // The native TTS engine plays audio directly; we mark it as
      // synthesized by recording a sentinel URI. A future native module
      // may produce an actual file path here.
      audioUri: 'tts://played',
    };
  }
}
