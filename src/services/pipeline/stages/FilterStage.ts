/**
 * FilterStage — uses a small/fast model to classify the user message.
 *
 * The filter model produces a short label (e.g. "analyze", "trivial",
 * "off_topic"). If the label contains the configured filterKeyword,
 * `shouldAnalyze` is set to true on the context so the downstream
 * AnalysisStage runs; otherwise it's set to false and the analysis
 * stage is skipped.
 *
 * This implements the "小模型过滤" leg of the v1.27.0 pipeline.
 */

import type {CompletionEngine} from '../../../utils/completionTypes';
import type {ApiCompletionParams} from '../../../utils/completionTypes';
import type {PipelineStage, PipelineContext} from '../types';

const FILTER_SYSTEM_PROMPT = `You are a router. Read the user message and output exactly one word:
- "analyze" if the message needs a thoughtful response
- "trivial" if it's a greeting, small talk, or simple acknowledgement
- "off_topic" if it's irrelevant

Output ONLY the single word, nothing else.`;

export class FilterStage implements PipelineStage {
  readonly name = 'filter';
  private engine: CompletionEngine;
  private filterKeyword: string;

  constructor(engine: CompletionEngine, filterKeyword: string = 'analyze') {
    this.engine = engine;
    this.filterKeyword = filterKeyword;
  }

  async execute(ctx: PipelineContext): Promise<PipelineContext> {
    const params: ApiCompletionParams = {
      messages: [
        {role: 'system', content: FILTER_SYSTEM_PROMPT},
        {role: 'user', content: ctx.userMessage},
      ],
      n_predict: 8, // we only need one word
      temperature: 0,
    };

    const result = await this.engine.completion(params);

    const filterResult = (result.text || result.content || '').trim().toLowerCase();
    const shouldAnalyze = filterResult.includes(this.filterKeyword.toLowerCase());

    return {
      ...ctx,
      filterResult,
      shouldAnalyze,
    };
  }
}
