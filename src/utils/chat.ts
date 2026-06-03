import {applyTemplate, Templates} from 'chat-formatter';
import {JinjaFormattedChatResult, LlamaContext} from 'llama.rn';
import {CompletionParams} from './completionTypes';
import {defaultCompletionParams} from './completionSettingsVersions';

import {
  AgentStep,
  AgentToolCall,
  ChatMessage,
  ChatTemplateConfig,
  HuggingFaceModel,
  MessageType,
  Model,
} from './types';

export const userId = 'y9d7f8pgn';
export const assistantId = 'h3o3lc5xj';
export const user = {id: userId};
export const assistant = {id: assistantId};

/**
 * Returns the visible textual content of a message in a single string.
 * Used by every `.text`-style consumer that should observe "final
 * visible content" — Bubble copy, drawer preview, exports, session
 * titles — so the type bifurcation between `Text` and `AssistantTurn`
 * is contained to one helper.
 *
 * For `AssistantTurn`, joins each step's `content` with a blank line
 * (matching the visible block-per-step rendering). Steps with no content
 * (e.g. tool-call-only steps) are skipped.
 */
export function derivedText(message: MessageType.Any): string {
  if (message.type === 'assistant_turn') {
    return ((message as MessageType.AssistantTurn).steps ?? [])
      .map(s => s.content)
      .filter((c): c is string => !!c && c.length > 0)
      .join('\n\n');
  }
  return 'text' in message && message.text ? message.text : '';
}

/**
 * Serialize an in-memory `AgentToolCall` into the wire shape llama.rn /
 * OpenAI accept. `function.arguments` is stored as a JSON-encoded
 * string throughout the runner; this just lifts it onto a ChatMessage.
 */
function toWireToolCall(
  call: AgentToolCall,
): NonNullable<ChatMessage['tool_calls']>[number] {
  return {
    id: call.id,
    type: 'function',
    function: {
      name: call.function?.name ?? '',
      arguments: call.function?.arguments ?? '',
    },
  } as NonNullable<ChatMessage['tool_calls']>[number];
}

/**
 * Build the API messages for one `AgentStep`. Emits an assistant message
 * (with `tool_calls` if present) followed by one role:'tool' message per
 * outcome. The OpenAI spec requires assistant-with-tool_calls to PRECEDE
 * its tool responses so `tool_call_id` back-refs resolve — preserved
 * by the inner ordering here (OUTER reverse below does not reorder inner
 * arrays).
 *
 * Orphan-pair guard: a step persisted with `tool_calls` but no matching
 * `tool_outcomes` (user abort fired between `step_finished` and
 * `tool_call_finished`, or process crash mid-step) would otherwise emit
 * `assistant.tool_calls` with zero matching `role:'tool'` responses.
 * Strict-Jinja chat templates reject that ("every tool_call_id must
 * have a matching tool response") and the next turn's prompt becomes
 * malformed. Synthesize an "aborted" sentinel response for every
 * unmatched call so the invariant holds on reload.
 */
function stepToApiMessages(step: AgentStep): ChatMessage[] {
  const assistantMsg: ChatMessage = {
    role: 'assistant',
    content: step.content ?? '',
  };
  if (step.toolCalls && step.toolCalls.length > 0) {
    assistantMsg.tool_calls = step.toolCalls.map(toWireToolCall);
  }
  if (step.reasoningContent) {
    assistantMsg.reasoning_content = step.reasoningContent;
  }
  const outcomes = step.toolOutcomes ?? [];
  const outcomeIds = new Set(outcomes.map(o => o.callId));
  const toolMsgs: ChatMessage[] = outcomes.map(o => ({
    role: 'tool',
    tool_call_id: o.callId,
    content: o.responseContent,
  }));
  // Orphan-pair guard (see fn doc): for any toolCall that lacks a
  // matching outcome, synthesize a sentinel response. Order matches the
  // toolCalls order so the assistant_msg.tool_calls[i] ↔ toolMsgs[i]
  // back-ref resolution stays stable for any consumer that relies on it.
  if (step.toolCalls) {
    for (const call of step.toolCalls) {
      if (!outcomeIds.has(call.id)) {
        toolMsgs.push({
          role: 'tool',
          tool_call_id: call.id,
          content: 'aborted',
        });
      }
    }
  }
  return [assistantMsg, ...toolMsgs];
}

export function convertToChatMessages(
  messages: MessageType.Any[],
  isMultimodalEnabled: boolean = true,
): ChatMessage[] {
  const groups: ChatMessage[][] = messages
    .filter(message => {
      if (message.type === 'assistant_turn') {
        // Include any AssistantTurn whose steps array is non-empty.
        // Filter rule preserves turns where a step has only tool_calls
        // (empty content) — the model still needs to see those plus
        // their tool responses on the next iteration so tool_call_id
        // back-refs resolve.
        return ((message as MessageType.AssistantTurn).steps ?? []).length > 0;
      }
      if (message.type === 'text') {
        const text = (message as MessageType.Text).text;
        return text !== undefined && text !== null && text.trim() !== '';
      }
      return false;
    })
    .map(message => {
      if (message.type === 'assistant_turn') {
        const turn = message as MessageType.AssistantTurn;
        // Each step → assistant message (+ tool messages). All steps for
        // one turn are emitted as one inner group so the OUTER reverse
        // keeps them adjacent in chronological order.
        return (turn.steps ?? []).flatMap(stepToApiMessages);
      }

      const textMessage = message as MessageType.Text;
      const role: 'assistant' | 'user' =
        message.author.id === assistant.id ? 'assistant' : 'user';
      const messageText = textMessage.text || '';

      // Multimodal user messages keep their existing shape.
      if (
        textMessage.imageUris &&
        textMessage.imageUris.length > 0 &&
        isMultimodalEnabled
      ) {
        const contentArray: Array<{
          type: 'text' | 'image_url';
          text?: string;
          image_url?: {url: string};
        }> = [
          {
            type: 'text',
            text: messageText,
          },
        ];

        contentArray.push(
          ...textMessage.imageUris.map(path => ({
            type: 'image_url' as const,
            image_url: {url: path},
          })),
        );

        return [
          {
            role,
            content: contentArray,
          } as ChatMessage,
        ];
      }

      return [
        {
          role,
          content: messageText,
        } as ChatMessage,
      ];
    });
  return groups.reverse().flat();
}

/**
 * Formats chat messages using the appropriate template based on the model or context.
 *
 * @param messages - Array of OAI compatible chat messages
 * @param model - The model configuration, which may contain a custom chat template
 * @param context - The LlamaContext instance, which may contain a chat template
 * @returns A formatted prompt
 *
 * Priority of template selection:
 * 1. Model's custom chat template (if available)
 * 2. Context's model-specific template (if available)
 * 3. Default chat template as fallback
 */
export async function applyChatTemplate(
  messages: ChatMessage[],
  model: Model | null,
  context: LlamaContext | null,
): Promise<string | JinjaFormattedChatResult> {
  const modelChatTemplate = model?.chatTemplate;
  const contextChatTemplate = (context?.model as any)?.metadata?.[
    'tokenizer.chat_template'
  ];

  let formattedChat: string | JinjaFormattedChatResult | undefined;

  try {
    // Model's custom chat template. This uses chat-formatter, which is based on Nunjucks (as opposed to Jinja2).
    if (modelChatTemplate?.chatTemplate) {
      // Convert multimodal messages to text-only for chat-formatter compatibility
      const textOnlyMessages = messages.map(msg => ({
        ...msg,
        content: Array.isArray(msg.content)
          ? msg.content.find(part => part.type === 'text')?.text || ''
          : msg.content,
      }));
      formattedChat = applyTemplate(textOnlyMessages, {
        customTemplate: modelChatTemplate,
        addGenerationPrompt: modelChatTemplate.addGenerationPrompt,
      }) as string;
    } else if (contextChatTemplate) {
      // Context's model-specific chat template. This uses llama.cpp's getFormattedChat.
      formattedChat = await context?.getFormattedChat(messages);
    }

    if (!formattedChat) {
      // Default chat template - convert multimodal messages to text-only for chat-formatter compatibility
      const textOnlyMessages = messages.map(msg => ({
        ...msg,
        content: Array.isArray(msg.content)
          ? msg.content.find(part => part.type === 'text')?.text || ''
          : msg.content,
      }));
      formattedChat = applyTemplate(textOnlyMessages, {
        customTemplate: chatTemplates.default,
        addGenerationPrompt: chatTemplates.default.addGenerationPrompt,
      }) as string;
    }
  } catch (error) {
    console.error('Error applying chat template:', error); // TODO: handle error
  }

  return formattedChat || ' ';
}

export const chatTemplates: Record<string, ChatTemplateConfig> = {
  custom: {
    name: 'custom',
    addGenerationPrompt: true,
    bosToken: '',
    eosToken: '',
    chatTemplate: '',
    systemPrompt: '',
  },
  danube3: {
    ...Templates.templates.danube2,
    name: 'danube3',
    addGenerationPrompt: true,
    systemPrompt:
      'You are a helpful assistant named H2O Danube3. You are precise, concise, and casual.',
  },
  danube2: {
    ...Templates.templates.danube2,
    name: 'danube2',
    addGenerationPrompt: true,
    systemPrompt:
      'You are a helpful assistant named H2O Danube2. You are precise, concise, and casual.',
  },
  phi3: {
    ...Templates.templates.phi3,
    name: 'phi3',
    addGenerationPrompt: true,
    systemPrompt:
      'You are a helpful conversational chat assistant. You are precise, concise, and casual.',
  },
  gemmaIt: {
    ...Templates.templates.gemmaIt,
    name: 'gemmaIt',
    addGenerationPrompt: true,
    systemPrompt:
      'You are a helpful conversational chat assistant. You are precise, concise, and casual.',
  },
  chatML: {
    ...Templates.templates.chatML,
    name: 'chatML',
    addGenerationPrompt: true,
    systemPrompt:
      'You are a helpful conversational chat assistant. You are precise, concise, and casual.',
  },
  default: {
    ...Templates.templates.default,
    name: 'default',
    addGenerationPrompt: true,
    systemPrompt:
      'You are a helpful conversational chat assistant. You are precise, concise, and casual.',
  },
  llama3: {
    ...Templates.templates.llama3,
    name: 'llama3',
    addGenerationPrompt: true,
    systemPrompt:
      'You are a helpful conversational chat assistant. You are precise, concise, and casual.',
  },
  llama32: {
    ...Templates.templates.llama32,
    name: 'llama32',
    addGenerationPrompt: true,
    systemPrompt: '',
  },
  gemmasutra: {
    ...Templates.templates.gemmasutra,
    name: 'gemmasutra',
    addGenerationPrompt: true,
    systemPrompt:
      'You are a helpful conversational chat assistant. You are precise, concise, and casual.',
  },
  qwen2: {
    ...Templates.templates.qwen2,
    name: 'qwen2',
    addGenerationPrompt: true,
    systemPrompt: 'You are a helpful assistant.',
  },
  qwen25: {
    ...Templates.templates.qwen25,
    name: 'qwen25',
    addGenerationPrompt: true,
    systemPrompt:
      'You are Qwen, created by Alibaba Cloud. You are a helpful assistant.',
  },
  smolLM: {
    name: 'smolLM',
    addGenerationPrompt: true,
    systemPrompt: 'You are a helpful assistant.',
    bosToken: '<|im_start|>',
    eosToken: '<|im_end|>',
    addBosToken: false,
    addEosToken: false,
    chatTemplate: '',
  },
  smolVLM: {
    name: 'smolVLM',
    addGenerationPrompt: true,
    systemPrompt: '',
    bosToken: '<|im_start|>',
    eosToken: '<|im_end|>',
    addBosToken: false,
    addEosToken: false,
    chatTemplate: '',
  },
};

export function getLocalModelDefaultSettings(): {
  chatTemplate: ChatTemplateConfig;
  completionParams: CompletionParams;
} {
  return {
    chatTemplate: chatTemplates.custom,
    completionParams: defaultCompletionParams,
  };
}

export function getHFDefaultSettings(hfModel: HuggingFaceModel): {
  chatTemplate: ChatTemplateConfig;
  completionParams: CompletionParams;
} {
  const _defaultChatTemplate = {
    addBosToken: false, // It is expected that chat templates will take care of this
    addEosToken: false, // It is expected that chat templates will take care of this
    bosToken: hfModel.specs?.gguf?.bos_token ?? '',
    eosToken: hfModel.specs?.gguf?.eos_token ?? '',
    //chatTemplate: hfModel.specs?.gguf?.chat_template ?? '',
    chatTemplate: '', // At the moment chatTemplate needs to be nunjucks, not jinja2. So by using empty string we force the use of gguf's chat template.
    addGenerationPrompt: true,
    systemPrompt: '',
    name: 'custom',
  };

  const _defaultCompletionParams = {
    ...defaultCompletionParams,
    stop: _defaultChatTemplate.eosToken ? [_defaultChatTemplate.eosToken] : [],
  };

  return {
    chatTemplate: _defaultChatTemplate,
    completionParams: _defaultCompletionParams,
  };
}

// Default completion parameters are now defined in settingsVersions.ts

export const stops = [
  '</s>',
  // '<|end|>', conflicts with gpt-oss. Which model uses <|end|>?
  '<|eot_id|>',
  '<|end_of_text|>',
  '<|im_end|>',
  '<|EOT|>',
  '<|END_OF_TURN_TOKEN|>',
  '<|end_of_turn|>',
  '<end_of_turn>',
  '<|endoftext|>',
  '<|return|>', // gpt-oss
  '<|END_RESPONSE|>', // cohere (tiny-aya)
];

/**
 * Removes thinking parts from text content.
 * This function removes content between <think>, <thought>, or <thinking> tags and their closing tags.
 *
 * @param text - The text to process
 * @returns The text with thinking parts removed
 */
export function removeThinkingParts(text: string): string {
  // Check if the text contains any thinking tags
  const hasThinkingTags =
    text.includes('<think>') ||
    text.includes('<thought>') ||
    text.includes('<thinking>');

  // If no thinking tags are found, return the original text
  if (!hasThinkingTags) {
    return text;
  }

  // Remove content between <think> and </think> tags
  let result = text.replace(/<think>[\s\S]*?<\/think>/g, '');

  // Remove content between <thought> and </thought> tags
  result = result.replace(/<thought>[\s\S]*?<\/thought>/g, '');

  // Remove content between <thinking> and </thinking> tags
  result = result.replace(/<thinking>[\s\S]*?<\/thinking>/g, '');

  // Log for debugging
  console.log('Removed thinking parts from context');

  return result;
}
