import {Templates} from 'chat-formatter';
import {
  applyChatTemplate,
  convertToChatMessages,
  getEffectiveChatTemplateInterpreter,
  user,
  assistant,
} from '../chat';
import {ChatMessage, ChatTemplateConfig, MessageType} from '../types';
import {createModel} from '../../../jest/fixtures/models';

const conversationWSystem: ChatMessage[] = [
  {role: 'system', content: 'System prompt. '},
  {role: 'user', content: 'Hi there!'},
  {role: 'assistant', content: 'Nice to meet you!'},
  {role: 'user', content: 'Can I ask a question?'},
];

describe('convertToChatMessages', () => {
  it('should convert text-only messages correctly', () => {
    const messages: MessageType.Text[] = [
      {
        id: '1',
        author: user,
        text: 'Hello',
        type: 'text',
        createdAt: Date.now(),
      },
      {
        id: '2',
        author: assistant,
        text: 'Hi there!',
        type: 'text',
        createdAt: Date.now(),
      },
    ];

    const result = convertToChatMessages(messages, true);

    expect(result).toEqual([
      {
        role: 'assistant',
        content: 'Hi there!',
      },
      {
        role: 'user',
        content: 'Hello',
      },
    ] as ChatMessage[]);
  });

  it('should convert multimodal messages with images correctly when multimodal is enabled', () => {
    const messages: MessageType.Text[] = [
      {
        id: '1',
        author: user,
        text: 'Look at this image',
        type: 'text',
        imageUris: ['file:///path/to/image1.jpg', 'file:///path/to/image2.jpg'],
        createdAt: Date.now(),
      },
      {
        id: '2',
        author: assistant,
        text: 'I can see the images',
        type: 'text',
        createdAt: Date.now(),
      },
    ];

    const result = convertToChatMessages(messages, true);

    expect(result).toEqual([
      {
        role: 'assistant',
        content: 'I can see the images',
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Look at this image',
          },
          {
            type: 'image_url',
            image_url: {url: 'file:///path/to/image1.jpg'},
          },
          {
            type: 'image_url',
            image_url: {url: 'file:///path/to/image2.jpg'},
          },
        ],
      },
    ] as ChatMessage[]);
  });

  it('should convert multimodal messages to text-only when multimodal is disabled', () => {
    const messages: MessageType.Text[] = [
      {
        id: '1',
        author: user,
        text: 'Look at this image',
        type: 'text',
        imageUris: ['file:///path/to/image1.jpg', 'file:///path/to/image2.jpg'],
        createdAt: Date.now(),
      },
      {
        id: '2',
        author: assistant,
        text: 'I can see the images',
        type: 'text',
        createdAt: Date.now(),
      },
    ];

    const result = convertToChatMessages(messages, false);

    expect(result).toEqual([
      {
        role: 'assistant',
        content: 'I can see the images',
      },
      {
        role: 'user',
        content: 'Look at this image', // Images should be stripped, only text remains
      },
    ] as ChatMessage[]);
  });

  it('should handle mixed conversation with text and multimodal messages', () => {
    const messages: MessageType.Text[] = [
      {
        id: '1',
        author: user,
        text: 'Hello',
        type: 'text',
        createdAt: Date.now(),
      },
      {
        id: '2',
        author: assistant,
        text: 'Hi! How can I help?',
        type: 'text',
        createdAt: Date.now(),
      },
      {
        id: '3',
        author: user,
        text: 'Can you analyze this image?',
        type: 'text',
        imageUris: ['file:///path/to/image.jpg'],
        createdAt: Date.now(),
      },
      {
        id: '4',
        author: assistant,
        text: 'I can see a beautiful landscape in the image.',
        type: 'text',
        createdAt: Date.now(),
      },
    ];

    const result = convertToChatMessages(messages, true);

    expect(result).toEqual([
      {
        role: 'assistant',
        content: 'I can see a beautiful landscape in the image.',
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Can you analyze this image?',
          },
          {
            type: 'image_url',
            image_url: {url: 'file:///path/to/image.jpg'},
          },
        ],
      },
      {
        role: 'assistant',
        content: 'Hi! How can I help?',
      },
      {
        role: 'user',
        content: 'Hello',
      },
    ] as ChatMessage[]);
  });

  it('should filter out non-text messages', () => {
    const messages: MessageType.Any[] = [
      {
        id: '1',
        author: user,
        text: 'Hello',
        type: 'text',
        createdAt: Date.now(),
      },
      {
        id: '2',
        author: user,
        type: 'image',
        uri: 'file:///path/to/image.jpg',
        name: 'image.jpg',
        size: 1024,
        createdAt: Date.now(),
      } as MessageType.Image,
      {
        id: '3',
        author: assistant,
        text: 'I can see your message',
        type: 'text',
        createdAt: Date.now(),
      },
    ];

    const result = convertToChatMessages(messages, true);

    expect(result).toEqual([
      {
        role: 'assistant',
        content: 'I can see your message',
      },
      {
        role: 'user',
        content: 'Hello',
      },
    ] as ChatMessage[]);
  });
});

describe('Test Danube2 Chat Templates', () => {
  it('Test danube-2 template with geneneration and system prompt', async () => {
    const chatTemplate: ChatTemplateConfig = {
      ...Templates.templates.danube2,
      //isBeginningOfSequence: true,
      //isEndOfSequence: true,
      addGenerationPrompt: true,
      name: 'danube2',
      templateInterpreter: 'jinja',
    };
    const model = createModel({chatTemplate: chatTemplate});
    const result = await applyChatTemplate(conversationWSystem, model, null);
    expect(result).toBe(
      'System prompt. </s><|prompt|>Hi there!</s><|answer|>Nice to meet you!</s><|prompt|>Can I ask a question?</s><|answer|>',
    );
  });
});

describe('template interpreter selection', () => {
  it('forces non-custom templates to use nunjucks', () => {
    expect(
      getEffectiveChatTemplateInterpreter({
        name: 'llama3',
        templateInterpreter: 'jinja',
      }),
    ).toBe('nunjucks');
  });

  it('keeps custom templates on configured interpreter', () => {
    expect(
      getEffectiveChatTemplateInterpreter({
        name: 'custom',
        templateInterpreter: 'nunjucks',
      }),
    ).toBe('nunjucks');
  });
});
