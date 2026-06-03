/**
 * Utility functions for detecting thinking capabilities in models.
 *
 * Delegates to llama.cpp's comprehensive detection (covering 25+ model families)
 * via llama.rn's getFormattedChat() API with enable_thinking support.
 */

import {LlamaContext, JinjaFormattedChatResult} from 'llama.rn';

export interface ThinkingDetectionResult {
  supported: boolean;
  thinkingStartTag?: string;
  thinkingEndTag?: string;
}

/**
 * Detects thinking capability by calling getFormattedChat with enable_thinking.
 * Delegates to llama.cpp's comprehensive detection covering 25+ model families.
 *
 * @param ctx The LlamaContext for the loaded model
 * @returns ThinkingDetectionResult with supported flag and optional thinking tags
 */
export async function detectThinkingCapability(
  ctx: LlamaContext,
): Promise<ThinkingDetectionResult> {
  try {
    const result = await ctx.getFormattedChat(
      [{role: 'user', content: 'test'}],
      null,
      {jinja: true, enable_thinking: true},
    );

    const jinjaResult = result as JinjaFormattedChatResult;
    if (jinjaResult.thinking_start_tag) {
      return {
        supported: true,
        thinkingStartTag: jinjaResult.thinking_start_tag,
        thinkingEndTag: jinjaResult.thinking_end_tag,
      };
    }

    return {supported: false};
  } catch (error) {
    console.warn('Thinking capability detection failed:', error);
    return {supported: false};
  }
}
