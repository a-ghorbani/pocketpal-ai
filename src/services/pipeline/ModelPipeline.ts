/**
 * ModelPipeline — orchestrates a sequence of PipelineStages.
 *
 * The pipeline runs stages in order, threading a PipelineContext through
 * each. Stages can be skipped via their `condition` predicate, and errors
 * in a stage are captured in metadata without aborting the whole pipeline
 * (the context passes through unchanged to the next stage).
 *
 * Canonical configuration (Phase 4.3, v1.27.0):
 *   FilterStage → AnalysisStage → TTSStage
 *
 * "小模型过滤 → 大模型分析 → TTS 输出" — all on-device.
 */

import type {PipelineStage, PipelineContext, PipelineMetadata} from './types';

export class ModelPipeline {
  private stages: PipelineStage[] = [];

  constructor(stages: PipelineStage[] = []) {
    this.stages = stages;
  }

  /** Append a stage to the end of the pipeline. */
  addStage(stage: PipelineStage): this {
    this.stages.push(stage);
    return this;
  }

  /** Replace all stages. */
  setStages(stages: PipelineStage[]): this {
    this.stages = stages;
    return this;
  }

  /** List configured stages (by name, in order). */
  listStages(): string[] {
    return this.stages.map(s => s.name);
  }

  /**
   * Run the pipeline.
   *
   * Each stage:
   *   1. Checks `condition(ctx)` — if false, marks 'skipped' and continues.
   *   2. Calls `execute(ctx)` — on success, uses the returned context.
   *      On error, marks 'error' with the message and passes the prior ctx.
   *   3. Records duration + status in metadata.
   *
   * Returns the final context with accumulated metadata.
   */
  async run(initial: PipelineContext): Promise<PipelineContext> {
    const startedAt = Date.now();
    const stageRecords: PipelineMetadata['stages'] = [];

    let ctx: PipelineContext = {
      ...initial,
      metadata: {stages: [], totalDurationMs: 0},
    };

    for (const stage of this.stages) {
      const stageStart = Date.now();

      // Condition check
      if (stage.condition && !stage.condition(ctx)) {
        stageRecords.push({
          name: stage.name,
          status: 'skipped',
          durationMs: Date.now() - stageStart,
        });
        continue;
      }

      try {
        const next = await stage.execute(ctx);
        const durationMs = Date.now() - stageStart;

        // Merge metadata from the stage's returned context (if any)
        // into our accumulating records. We pull token counts from the
        // stage's own metadata entry if it set one.
        const stageMeta = next.metadata.stages.find(s => s.name === stage.name);
        stageRecords.push({
          name: stage.name,
          status: 'success',
          durationMs,
          tokensPredicted: stageMeta?.tokensPredicted,
          tokensEvaluated: stageMeta?.tokensEvaluated,
        });

        // Carry forward the stage's mutations (response, audioUri, etc.)
        // but keep our own accumulating metadata.
        ctx = {
          ...next,
          metadata: {stages: stageRecords, totalDurationMs: 0},
        };
      } catch (err: any) {
        stageRecords.push({
          name: stage.name,
          status: 'error',
          durationMs: Date.now() - stageStart,
          error: err?.message || String(err),
        });
        // Context passes through unchanged on error
        ctx = {
          ...ctx,
          metadata: {stages: stageRecords, totalDurationMs: 0},
        };
      }
    }

    ctx.metadata.totalDurationMs = Date.now() - startedAt;
    return ctx;
  }
}
