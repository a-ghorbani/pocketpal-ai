/**
 * AnalysisStage — uses a large model to produce the response.
 *
 * Runs only if the upstream FilterStage set `shouldAnalyze` to true
 * (or if no filter stage is configured — `shouldAnalyze` defaults to
 * true in the initial PipelineContext).
 *
 * This implements the "大模型分析" leg of the v1.27.0 pipeline.
 */

import type {CompletionEngine, CompletionStreamData} from '../../../utils/completionTypes';
import type {ApiCompletionParams} from '../../../utils/completionTypes';
import type {PipelineStage, PipelineContext} from '../types';

const DEFAULT_SYSTEM_PROMPT = 'You are a helpful assistant. Provide a thoughtful response.';

export class AnalysisStage implements PipelineStage {
  readonly name = 'analysis';
  private engine: CompletionEngine;
  private systemPrompt: string;

  constructor(engine: CompletionEngine, systemPrompt: string = DEFAULT_SYSTEM_PROMPT) {
    this.engine = engine;
    this.systemPrompt = systemPrompt;
  }

  /** Skip if the filter said "don't analyze". */
  condition(ctx: PipelineContext): boolean {
    return ctx.shouldAnalyze;
  }

  async execute(ctx: PipelineContext): Promise<PipelineContext> {
    // Build messages from history + current message
    const messages: ApiCompletionParams['messages'] = [
      {role: 'system', content: this.systemPrompt},
      ...(ctx.history || []),
      {role: 'user', content: ctx.userMessage},
    ];

    const params: ApiCompletionParams = {
      messages,
      n_predict: 512,
      temperature: 0.7,
    };

    let accumulated = '';
    const result = await this.engine.completion(params, (data: CompletionStreamData) => {
      if (data.token) {
        accumulated += data.token;
      }
    });

    return {
      ...ctx,
      response: result.text || result.content || accumulated,
      reasoning: result.reasoning_content,
      metadata: {
        ...ctx.metadata,
        stages: [
          ...ctx.metadata.stages,
          {
            name: this.name,
            status: 'success' as const,
            durationMs: 0,
            tokensPredicted: result.tokens_predicted,
            tokensEvaluated: result.tokens_evaluated,
          },
        ],
      },
    };
  }
}
