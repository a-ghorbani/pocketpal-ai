/**
 * Multi-model pipeline barrel export (Phase 4.3, v1.27.0).
 *
 * Canonical pipeline: filter (small model) → analysis (large model) →
 * TTS (optional). All stages run on-device.
 *
 * Usage:
 *   const pipeline = createDefaultPipeline({
 *     filterEngine: smallLlm,
 *     analysisEngine: largeLlm,
 *     ttsEngine: systemTts,  // optional
 *     config: {enableTTS: true},
 *   });
 *   const result = await pipeline.run(createContext('What is RAG?'));
 */

export {ModelPipeline} from './ModelPipeline';
export {FilterStage} from './stages/FilterStage';
export {AnalysisStage} from './stages/AnalysisStage';
export {TTSStage} from './stages/TTSStage';

export type {
  PipelineContext,
  PipelineMetadata,
  PipelineStage,
  PipelineConfig,
} from './types';
export {DEFAULT_PIPELINE_CONFIG} from './types';

import {ModelPipeline} from './ModelPipeline';
import {FilterStage} from './stages/FilterStage';
import {AnalysisStage} from './stages/AnalysisStage';
import {TTSStage} from './stages/TTSStage';
import type {
  CompletionEngine,
} from '../../utils/completionTypes';
import type {Engine as TTSEngine, Voice} from '../tts/types';
import type {PipelineContext, PipelineConfig} from './types';
import {DEFAULT_PIPELINE_CONFIG} from './types';

/** Engines needed to build a default pipeline. */
export interface DefaultPipelineEngines {
  /** Small/fast model for the filter stage. */
  filterEngine: CompletionEngine;
  /** Large model for the analysis stage. */
  analysisEngine: CompletionEngine;
  /** TTS engine (required only if enableTTS is true). */
  ttsEngine?: TTSEngine;
  /** Optional voice override for TTS. */
  ttsVoice?: Voice;
  /** Optional system prompt for the analysis stage. */
  analysisSystemPrompt?: string;
}

/**
 * Build the canonical small→large→TTS pipeline.
 *
 * Stages included depend on the config:
 *   enableFilter (default true)  → FilterStage prepended
 *   enableTTS (default false)    → TTSStage appended
 *
 * The AnalysisStage is always included.
 */
export function createDefaultPipeline(
  engines: DefaultPipelineEngines,
  config: PipelineConfig = DEFAULT_PIPELINE_CONFIG,
): ModelPipeline {
  const stages = [];

  if (config.enableFilter !== false) {
    stages.push(new FilterStage(engines.filterEngine, config.filterKeyword));
  }

  stages.push(
    new AnalysisStage(engines.analysisEngine, engines.analysisSystemPrompt),
  );

  if (config.enableTTS && engines.ttsEngine) {
    stages.push(new TTSStage(engines.ttsEngine, engines.ttsVoice));
  }

  return new ModelPipeline(stages);
}

/**
 * Create the initial PipelineContext for a user message.
 * `shouldAnalyze` defaults to true so that, if no filter stage is
 * configured, the analysis stage still runs.
 */
export function createContext(
  userMessage: string,
  history?: PipelineContext['history'],
): PipelineContext {
  return {
    userMessage,
    history,
    shouldAnalyze: true,
    metadata: {stages: [], totalDurationMs: 0},
  };
}
