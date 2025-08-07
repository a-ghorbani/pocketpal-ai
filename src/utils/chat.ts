import {applyTemplate, Templates} from 'chat-formatter';
import {JinjaFormattedChatResult, LlamaContext} from '@pocketpalai/llama.rn';
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

export function convertToChatMessages(
  messages: MessageType.Any[],
  isMultimodalEnabled: boolean = true,
): ChatMessage[] {
  return messages
    .filter(message => message.type === 'text' && message.text !== undefined)
    .map(message => {
      const textMessage = message as MessageType.Text;
      const role: 'assistant' | 'user' =
        message.author.id === assistant.id ? 'assistant' : 'user';

      // Check if this message has images (multimodal) and if multimodal is enabled
      if (
        textMessage.imageUris &&
        textMessage.imageUris.length > 0 &&
        isMultimodalEnabled
      ) {
        // Create multimodal content with text and images
        const content: Array<{
          type: 'text' | 'image_url';
          text?: string;
          image_url?: {url: string};
        }> = [
          {
            type: 'text',
            text: textMessage.text!,
          },
        ];

        // Add images to content
        content.push(
          ...textMessage.imageUris.map(path => ({
            type: 'image_url' as const,
            image_url: {url: path},
          })),
        );

        return {
          role,
          content,
        } as ChatMessage;
      } else {
        // Text-only message (backward compatibility)
        return {
          role,
          content: textMessage.text!,
        } as ChatMessage;
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
