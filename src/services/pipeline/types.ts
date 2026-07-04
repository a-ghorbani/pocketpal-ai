/**
 * Multi-model collaboration pipeline types (Phase 4.3, v1.27.0).
 *
 * A pipeline orchestrates a sequence of stages that each transform or
 * augment a shared PipelineContext. The canonical configuration is:
 *
 *   FilterStage (small model) → AnalysisStage (large model) → TTSStage
 *
 * but the pipeline is generic — stages can be inserted, reordered, or
 * skipped based on a stage's `condition` predicate.
 *
 * Stages are pure functions over PipelineContext — they don't own state.
 * This mirrors the CompletionEngine / TalentEngine pattern: a thin
 * interface that real engines implement.
 */

/**
 * The shared state that flows through the pipeline.
 * Each stage reads some fields and writes others.
 */
export interface PipelineContext {
  /** Original user input. */
  userMessage: string;
  /** Conversation history (optional, for context-aware stages). */
  history?: Array<{role: 'user' | 'assistant' | 'system'; content: string}>;
  /**
   * Output of the filter stage: a short classification or routing
   * decision. E.g. "needs_analysis", "trivial", "off_topic".
   */
  filterResult?: string;
  /**
   * Whether the filter decided the analysis stage should run.
   * Defaults to true if no filter stage is configured.
   */
  shouldAnalyze: boolean;
  /** Output of the analysis stage — the model's response text. */
  response?: string;
  /** Optional reasoning content (for thinking models). */
  reasoning?: string;
  /** Output URI of the TTS stage, if it ran. */
  audioUri?: string;
  /** Per-stage metadata (durations, token counts, errors). */
  metadata: PipelineMetadata;
}

export interface PipelineMetadata {
  /** Stages that ran, in order, with their durations (ms) and status. */
  stages: Array<{
    name: string;
    status: 'success' | 'skipped' | 'error';
    durationMs: number;
    error?: string;
    tokensPredicted?: number;
    tokensEvaluated?: number;
  }>;
  /** Total pipeline wall-clock duration (ms). */
  totalDurationMs: number;
}

/** A single stage in the pipeline. */
export interface PipelineStage {
  /** Unique name for metadata / logging. */
  readonly name: string;
  /**
   * Optional predicate — if false, the stage is skipped (status: 'skipped'
   * in metadata) and the context passes through unchanged.
   */
  condition?(ctx: PipelineContext): boolean;
  /**
   * Execute the stage, returning an updated context.
   * Implementations should not mutate the input — return a new object.
   */
  execute(ctx: PipelineContext): Promise<PipelineContext>;
}

/** Configuration for building the default small→large→TTS pipeline. */
export interface PipelineConfig {
  /** Whether to include the filter stage (small model). Default: true. */
  enableFilter?: boolean;
  /** Whether to include the TTS output stage. Default: false. */
  enableTTS?: boolean;
  /**
   * Threshold for the filter stage to decide "needs analysis".
   * If the small model's response contains this substring, analysis runs.
   * Default: 'analyze'.
   */
  filterKeyword?: string;
}

export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  enableFilter: true,
  enableTTS: false,
  filterKeyword: 'analyze',
};
