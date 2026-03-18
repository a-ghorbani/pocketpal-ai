import {applyTemplate, Templates} from 'chat-formatter';
import {JinjaFormattedChatResult, LlamaContext} from 'llama.rn';
import {CompletionParams} from './completionTypes';
import {defaultCompletionParams} from './completionSettingsVersions';

import {
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

export type ChatTemplateInterpreter = 'nunjucks' | 'jinja';
export type NormalizedChatTemplateResult = {
  prompt: string;
  additionalStops: string[];
  grammar?: string;
  grammarLazy?: boolean;
  grammarTriggers?: unknown[];
  preservedTokens?: unknown[];
  chatParser?: string;
  hasMedia?: boolean;
  mediaPaths: string[];
  chatFormat?: number;
  thinkingForcedOpen?: boolean;
};

export const chatTemplateInterpreterOptions: ChatTemplateInterpreter[] = [
  'nunjucks',
  'jinja',
];

export function getChatTemplateInterpreterDisplayName(
  interpreter: ChatTemplateInterpreter,
): string {
  switch (interpreter) {
    case 'jinja':
      return 'llama.cpp / Jinja';
    case 'nunjucks':
    default:
      return 'chat-formatter / Nunjucks';
  }
}

export function getEffectiveChatTemplateInterpreter(
  chatTemplate?: Partial<ChatTemplateConfig> | null,
): ChatTemplateInterpreter {
  if (chatTemplate?.name && chatTemplate.name !== 'custom') {
    return 'nunjucks';
  }

  return chatTemplate?.templateInterpreter ?? 'jinja';
}

function toTextOnlyMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map(msg => ({
    ...msg,
    content: Array.isArray(msg.content)
      ? msg.content.find(part => part.type === 'text')?.text || ''
      : msg.content,
  }));
}

export function convertToChatMessages(
  messages: MessageType.Any[],
  isMultimodalEnabled: boolean = true,
): ChatMessage[] {
  return messages
    .filter(message => {
      // Filter out non-text messages
      if (message.type !== 'text') return false;

      // Filter out messages with null, undefined, or empty text
      const text = (message as MessageType.Text).text;
      return text !== undefined && text !== null && text.trim() !== '';
    })
    .map(message => {
      const textMessage = message as MessageType.Text;
      const role: 'assistant' | 'user' =
        message.author.id === assistant.id ? 'assistant' : 'user';

      // Ensure text is a non-null string
      const messageText = textMessage.text || '';

      // For assistant messages, get reasoning_content from metadata if available
      // llama.rn already extracts this for us during completion
      const reasoningContent =
        role === 'assistant'
          ? textMessage.metadata?.completionResult?.reasoning_content ||
            textMessage.metadata?.partialCompletionResult?.reasoning_content
          : undefined;

      // Check if this message has images (multimodal) and if multimodal is enabled
      if (
        textMessage.imageUris &&
        textMessage.imageUris.length > 0 &&
        isMultimodalEnabled
      ) {
        // Create multimodal content with text and images
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

        // Add images to content
        contentArray.push(
          ...textMessage.imageUris.map(path => ({
            type: 'image_url' as const,
            image_url: {url: path},
          })),
        );

        const chatMessage: any = {
          role,
          content: contentArray,
        };

        // Add reasoning_content if present (for chat context)
        if (reasoningContent) {
          chatMessage.reasoning_content = reasoningContent;
        }

        return chatMessage as ChatMessage;
      } else {
        // Text-only message (backward compatibility)
        const chatMessage: any = {
          role,
          content: messageText,
        };

        // Add reasoning_content if present (for chat context)
        if (reasoningContent) {
          chatMessage.reasoning_content = reasoningContent;
        }

        return chatMessage as ChatMessage;
      }
    })
    .reverse();
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
  enableThinking: boolean = false,
): Promise<string | JinjaFormattedChatResult> {
  const modelChatTemplate = model?.chatTemplate;
  const effectiveInterpreter =
    getEffectiveChatTemplateInterpreter(modelChatTemplate);
  const contextChatTemplate = (context?.model as any)?.metadata?.[
    'tokenizer.chat_template'
  ];

  let formattedChat: string | JinjaFormattedChatResult | undefined;

  try {
    if (effectiveInterpreter === 'jinja') {
      if (context?.getFormattedChat) {
        const customTemplate = modelChatTemplate?.chatTemplate?.trim() || null;
        formattedChat = await (context as any).getFormattedChat(
          messages,
          customTemplate,
          {
            jinja: true,
            enable_thinking: enableThinking,
          },
        );
      }
    } else if (modelChatTemplate?.chatTemplate?.trim()) {
      formattedChat = applyTemplate(toTextOnlyMessages(messages) as any, {
        customTemplate: modelChatTemplate,
        addGenerationPrompt: modelChatTemplate.addGenerationPrompt,
      }) as string;
    }

    if (
      !formattedChat &&
      effectiveInterpreter === 'jinja' &&
      contextChatTemplate
    ) {
      formattedChat = await (context as any)?.getFormattedChat(messages, null, {
        jinja: true,
        enable_thinking: enableThinking,
      });
    }

    if (!formattedChat) {
      formattedChat = applyTemplate(toTextOnlyMessages(messages) as any, {
        customTemplate: chatTemplates.default,
        addGenerationPrompt: chatTemplates.default.addGenerationPrompt,
      }) as string;
    }
  } catch (error) {
    console.error('Error applying chat template:', error); // TODO: handle error
  }

  return formattedChat || ' ';
}

export function normalizeChatTemplateResult(
  formattedChat: string | JinjaFormattedChatResult,
): NormalizedChatTemplateResult {
  if (typeof formattedChat === 'string') {
    return {
      prompt: formattedChat,
      additionalStops: [],
      mediaPaths: [],
    };
  }

  const jinjaResult = formattedChat as any;
  const mediaPaths = Array.isArray(jinjaResult.media_paths)
    ? jinjaResult.media_paths.filter(
        (path: unknown): path is string =>
          typeof path === 'string' && path.length > 0,
      )
    : typeof jinjaResult.media_paths === 'string' &&
        jinjaResult.media_paths.length > 0
      ? [jinjaResult.media_paths]
      : [];

  return {
    prompt: jinjaResult.prompt || JSON.stringify(formattedChat),
    additionalStops: jinjaResult.additional_stops || [],
    grammar: jinjaResult.grammar,
    grammarLazy: jinjaResult.grammar_lazy,
    grammarTriggers: jinjaResult.grammar_triggers,
    preservedTokens: jinjaResult.preserved_tokens,
    chatParser: jinjaResult.chat_parser,
    hasMedia: Boolean(jinjaResult.has_media) || mediaPaths.length > 0,
    mediaPaths,
    chatFormat:
      typeof jinjaResult.chat_format === 'number'
        ? jinjaResult.chat_format
        : undefined,
    thinkingForcedOpen:
      typeof jinjaResult.thinking_forced_open === 'boolean'
        ? jinjaResult.thinking_forced_open
        : undefined,
  };
}

export const chatTemplates: Record<string, ChatTemplateConfig> = {
  custom: {
    name: 'custom',
    addGenerationPrompt: true,
    bosToken: '',
    eosToken: '',
    chatTemplate: '',
    systemPrompt: '',
    templateInterpreter: 'jinja',
  },
  danube3: {
    ...Templates.templates.danube2,
    name: 'danube3',
    addGenerationPrompt: true,
    systemPrompt:
      'You are a helpful assistant named H2O Danube3. You are precise, concise, and casual.',
    templateInterpreter: 'nunjucks',
  },
  danube2: {
    ...Templates.templates.danube2,
    name: 'danube2',
    addGenerationPrompt: true,
    systemPrompt:
      'You are a helpful assistant named H2O Danube2. You are precise, concise, and casual.',
    templateInterpreter: 'nunjucks',
  },
  phi3: {
    ...Templates.templates.phi3,
    name: 'phi3',
    addGenerationPrompt: true,
    systemPrompt:
      'You are a helpful conversational chat assistant. You are precise, concise, and casual.',
    templateInterpreter: 'nunjucks',
  },
  gemmaIt: {
    ...Templates.templates.gemmaIt,
    name: 'gemmaIt',
    addGenerationPrompt: true,
    systemPrompt:
      'You are a helpful conversational chat assistant. You are precise, concise, and casual.',
    templateInterpreter: 'nunjucks',
  },
  chatML: {
    ...Templates.templates.chatML,
    name: 'chatML',
    addGenerationPrompt: true,
    systemPrompt:
      'You are a helpful conversational chat assistant. You are precise, concise, and casual.',
    templateInterpreter: 'nunjucks',
  },
  default: {
    ...Templates.templates.default,
    name: 'default',
    addGenerationPrompt: true,
    systemPrompt:
      'You are a helpful conversational chat assistant. You are precise, concise, and casual.',
    templateInterpreter: 'nunjucks',
  },
  llama3: {
    ...Templates.templates.llama3,
    name: 'llama3',
    addGenerationPrompt: true,
    systemPrompt:
      'You are a helpful conversational chat assistant. You are precise, concise, and casual.',
    templateInterpreter: 'nunjucks',
  },
  llama32: {
    ...Templates.templates.llama32,
    name: 'llama32',
    addGenerationPrompt: true,
    systemPrompt: '',
    templateInterpreter: 'nunjucks',
  },
  gemmasutra: {
    ...Templates.templates.gemmasutra,
    name: 'gemmasutra',
    addGenerationPrompt: true,
    systemPrompt:
      'You are a helpful conversational chat assistant. You are precise, concise, and casual.',
    templateInterpreter: 'nunjucks',
  },
  qwen2: {
    ...Templates.templates.qwen2,
    name: 'qwen2',
    addGenerationPrompt: true,
    systemPrompt: 'You are a helpful assistant.',
    templateInterpreter: 'nunjucks',
  },
  qwen25: {
    ...Templates.templates.qwen25,
    name: 'qwen25',
    addGenerationPrompt: true,
    systemPrompt:
      'You are Qwen, created by Alibaba Cloud. You are a helpful assistant.',
    templateInterpreter: 'nunjucks',
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
    templateInterpreter: 'nunjucks',
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
    templateInterpreter: 'nunjucks',
  },
};

export const chatTemplateOptions: string[] = Object.keys(chatTemplates);

export function getChatTemplateDisplayName(templateName: string): string {
  const template = chatTemplates[templateName as keyof typeof chatTemplates];
  if (!template) {
    return templateName;
  }
  return template.name || templateName;
}

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
    templateInterpreter: 'jinja' as const,
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
