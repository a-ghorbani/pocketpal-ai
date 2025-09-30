/**
 * Utility functions for detecting thinking capabilities in models
 */

import {LlamaContext} from '@pocketpalai/llama.rn';
import {Model} from './types';

// List of known thinking-capable model architectures
const KNOWN_THINKING_CAPABLE_ARCHITECTURES = ['qwen3', 'smollm3'];

// Thinking-related tokens to check in chat templates
const THINKING_TOKENS = [
  '<think>',
  '</think>',
  'assistant_thoughts',
  'reasoning_format',
  '<|start_thinking|>',
  '<|end_thinking|>',
  '<|thinking|>',
  'start_thinking',
  'end_thinking',
];

/**
 * Checks if a model supports thinking capabilities
 *
 * @param model The model to check
 * @param ctx Optional LlamaContext if already loaded
 * @returns Promise<boolean> True if the model supports thinking
 */
export async function supportsThinking(
  model: Model,
  ctx?: LlamaContext,
): Promise<boolean> {
  // First check: Architecture-based detection using model metadata
  let modelArchitecture: string | undefined;

  if (ctx?.model?.metadata) {
    // Get architecture from loaded model metadata
    modelArchitecture = ctx.model.metadata['general.architecture'];
  } else if (model.hfModel?.specs?.gguf?.architecture) {
    // Get architecture from HF model specs
    modelArchitecture = model.hfModel.specs.gguf.architecture;
  }

  if (modelArchitecture) {
    const archLower = modelArchitecture.toLowerCase();
    for (const architecture of KNOWN_THINKING_CAPABLE_ARCHITECTURES) {
      if (archLower.includes(architecture)) {
        return true;
      }
    }
  }

  // Third check: Chat template analysis
  if (model.chatTemplate?.chatTemplate) {
    if (templateSupportsThinking(model.chatTemplate.chatTemplate)) {
      return true;
    }
  }

  // Fourth check: Context-based analysis (if context is available)
  if (ctx) {
    try {
      // Check model metadata for chat template
      const modelMetadata = (ctx.model as any)?.metadata;
      if (modelMetadata) {
        const chatTemplate = modelMetadata['tokenizer.chat_template'];
        if (chatTemplate && templateSupportsThinking(chatTemplate)) {
          return true;
        }
      }

      // Check model description for thinking-related terms
      const modelDesc = ctx.model.desc.toLowerCase();
      for (const token of THINKING_TOKENS) {
        if (modelDesc.includes(token.toLowerCase())) {
          return true;
        }
      }
    } catch (error) {
      console.error('Error checking thinking capabilities:', error);
    }
  }

  // Default to false if no thinking capabilities detected
  return false;
}

/**
 * Checks if a model's chat template contains thinking-related tokens
 *
 * @param template The chat template string
 * @returns boolean True if the template contains thinking tokens
 */
export function templateSupportsThinking(template: string): boolean {
  if (!template) {
    return false;
  }

  const templateLower = template.toLowerCase();

  // Check for thinking-related tokens
  for (const token of THINKING_TOKENS) {
    if (templateLower.includes(token.toLowerCase())) {
      return true;
    }
  }

  // Check for specific template patterns that indicate thinking support
  // DeepSeek-R1 pattern
  if (
    templateLower.includes('deepseek') &&
    (templateLower.includes('<think>') || templateLower.includes('thinking'))
  ) {
    return true;
  }

  // Cohere Command-R pattern
  if (
    templateLower.includes('cohere') &&
    (templateLower.includes('thinking') || templateLower.includes('reasoning'))
  ) {
    return true;
  }

  // Qwen-3 pattern
  if (templateLower.includes('qwen') && templateLower.includes('thinking')) {
    return true;
  }

  return false;
}
