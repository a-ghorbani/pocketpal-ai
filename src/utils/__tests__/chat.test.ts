import {Templates} from 'chat-formatter';
import {
  applyChatTemplate,
  convertToChatMessages,
  derivedText,
  user,
  assistant,
} from '../chat';
import {AgentStep, ChatMessage, ChatTemplateConfig, MessageType} from '../types';
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

// ---------- AssistantTurn coverage (story Test Requirements §convertToChatMessages) ----------

const makeUserText = (text: string, id = String(Math.random())) =>
  ({
    id,
    author: user,
    text,
    type: 'text',
    createdAt: 0,
  }) as MessageType.Text;

const makeAssistantTurn = (
  steps: AgentStep[],
  id = 'turn-' + Math.random(),
): MessageType.AssistantTurn => ({
  id,
  type: 'assistant_turn',
  author: assistant,
  createdAt: 0,
  steps,
  metadata: {},
});

describe('convertToChatMessages — AssistantTurn', () => {
  // Reminder: convertToChatMessages reverses message groups (chronological
  // input is the order the chat list keeps — newest first). User-then-
  // assistant order in the input becomes assistant-then-user in the output.

  it('#1 AssistantTurn with one step (no tools) → one assistant API message', () => {
    const result = convertToChatMessages(
      [makeAssistantTurn([{content: 'Hi there!'}])],
      true,
    );
    expect(result).toEqual([{role: 'assistant', content: 'Hi there!'}]);
  });

  it('#2 [preamble+toolCall, followup] → assistant(content, tool_calls) + tool + assistant(content) — three API messages', () => {
    const turn = makeAssistantTurn([
      {
        content: 'Let me calculate',
        toolCalls: [
          {id: 'c0', function: {name: 'calculate', arguments: '{"expr":"2+2"}'}},
        ],
        toolOutcomes: [
          {
            callId: 'c0',
            toolName: 'calculate',
            result: {type: 'text', summary: '4'},
            responseContent: '4',
          },
        ],
      },
      {content: 'The answer is 4'},
    ]);
    const result = convertToChatMessages([turn]);
    expect(result).toEqual([
      {
        role: 'assistant',
        content: 'Let me calculate',
        tool_calls: [
          {
            id: 'c0',
            type: 'function',
            function: {name: 'calculate', arguments: '{"expr":"2+2"}'},
          },
        ],
      },
      {role: 'tool', tool_call_id: 'c0', content: '4'},
      {role: 'assistant', content: 'The answer is 4'},
    ]);
  });

  it('#3 step with empty content but tool_calls → assistant message with empty content + tool_calls', () => {
    const turn = makeAssistantTurn([
      {
        content: '',
        toolCalls: [
          {id: 'c0', function: {name: 'datetime', arguments: '{}'}},
        ],
      },
    ]);
    const result = convertToChatMessages([turn]);
    expect(result).toEqual([
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'c0',
            type: 'function',
            function: {name: 'datetime', arguments: '{}'},
          },
        ],
      },
    ]);
  });

  it('#4 legacy Text assistant message → unchanged behavior', () => {
    const result = convertToChatMessages(
      [
        {
          id: '1',
          author: assistant,
          text: 'classic',
          type: 'text',
          createdAt: 0,
        } as MessageType.Text,
      ],
      true,
    );
    expect(result).toEqual([{role: 'assistant', content: 'classic'}]);
  });

  it('#5 does NOT read metadata.talentCalls / toolMessages / talentResults (fixtures with empty metadata except metadata.steps)', () => {
    // Construct a turn with empty top-level metadata. If conversion
    // were still reading legacy metadata-bag fields, it would pull in
    // calls from the wrong place.
    const turn = makeAssistantTurn([
      {
        content: '',
        toolCalls: [
          {id: 'c0', function: {name: 'calculate', arguments: '{}'}},
        ],
        toolOutcomes: [
          {
            callId: 'c0',
            toolName: 'calculate',
            result: {type: 'text', summary: '7'},
            responseContent: '7',
          },
        ],
      },
    ]);
    // Sanity: metadata is empty.
    turn.metadata = {};
    const result = convertToChatMessages([turn]);
    expect(result).toEqual([
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {id: 'c0', type: 'function', function: {name: 'calculate', arguments: '{}'}},
        ],
      },
      {role: 'tool', tool_call_id: 'c0', content: '7'},
    ]);
  });

  it('#6 history filter: AssistantTurn with empty content but non-empty toolCalls is INCLUDED', () => {
    const turn = makeAssistantTurn([
      {toolCalls: [{id: 'c0', function: {name: 'calculate', arguments: '{}'}}]},
    ]);
    const result = convertToChatMessages([turn]);
    expect(result).toHaveLength(1);
    expect(result[0].tool_calls).toBeDefined();
  });

  it('AssistantTurn with steps:[] is excluded (filter rule)', () => {
    const turn = makeAssistantTurn([]);
    const result = convertToChatMessages([turn]);
    expect(result).toEqual([]);
  });

  it('serializes AgentToolCall.arguments as a string at the wire boundary even when stored as object', () => {
    const turn = makeAssistantTurn([
      {
        content: '',
        toolCalls: [
          {
            id: 'c0',
            function: {
              name: 'calculate',
              // Stored as parsed object — must be JSON.stringified at wire.
              arguments: {expr: '2+2'} as unknown as Record<string, unknown>,
            },
          },
        ],
      },
    ]);
    const result = convertToChatMessages([turn]);
    expect(result[0].tool_calls?.[0].function.arguments).toBe('{"expr":"2+2"}');
  });

  it('preserves step.reasoningContent on the wire as assistant.reasoning_content', () => {
    const turn = makeAssistantTurn([
      {content: 'final', reasoningContent: 'thinking out loud'},
    ]);
    const result = convertToChatMessages([turn]);
    expect((result[0] as any).reasoning_content).toBe('thinking out loud');
  });

  it('multi-step turn produces N steps × (assistant [+ tool*]) preserving inner order', () => {
    const turn = makeAssistantTurn([
      {
        content: 'A',
        toolCalls: [{id: 'c0', function: {name: 'x', arguments: '{}'}}],
        toolOutcomes: [
          {
            callId: 'c0',
            toolName: 'x',
            result: {type: 'text', summary: 'r0'},
            responseContent: 'r0',
          },
        ],
      },
      {
        content: 'B',
        toolCalls: [{id: 'c1', function: {name: 'y', arguments: '{}'}}],
        toolOutcomes: [
          {
            callId: 'c1',
            toolName: 'y',
            result: {type: 'text', summary: 'r1'},
            responseContent: 'r1',
          },
        ],
      },
      {content: 'C'},
    ]);
    const result = convertToChatMessages([turn]);
    // Roles in order: assistant(A,calls)+tool(c0)+assistant(B,calls)+tool(c1)+assistant(C)
    const roles = result.map(m => m.role);
    expect(roles).toEqual(['assistant', 'tool', 'assistant', 'tool', 'assistant']);
    expect((result[0] as any).tool_calls?.[0].id).toBe('c0');
    expect((result[1] as any).tool_call_id).toBe('c0');
    expect((result[2] as any).tool_calls?.[0].id).toBe('c1');
  });

  it('mixed history: user → assistant_turn → user round-trips correctly (and reverses to API order)', () => {
    const userMsg = makeUserText('What is 2+2?', 'u1');
    const turn = makeAssistantTurn([{content: 'It is 4'}], 't1');
    const userMsg2 = makeUserText('thanks', 'u2');
    // The chat list passes newest-first; convertToChatMessages reverses.
    const result = convertToChatMessages([userMsg2, turn, userMsg]);
    expect(result.map(m => m.role)).toEqual(['user', 'assistant', 'user']);
    expect((result[0] as any).content).toBe('What is 2+2?');
    expect((result[1] as any).content).toBe('It is 4');
    expect((result[2] as any).content).toBe('thanks');
  });
});

describe('derivedText', () => {
  it('#7a Text → returns text', () => {
    const msg: MessageType.Text = {
      id: '1',
      author: user,
      text: 'hello',
      type: 'text',
    };
    expect(derivedText(msg)).toBe('hello');
  });

  it('#7b AssistantTurn → joins step.content with \\n\\n, skips empty', () => {
    const turn: MessageType.AssistantTurn = {
      id: 't',
      type: 'assistant_turn',
      author: assistant,
      steps: [
        {content: 'preamble'},
        {content: ''}, // skipped
        {toolCalls: [{id: 'c', function: {name: 'x', arguments: '{}'}}]}, // no content — skipped
        {content: 'final answer'},
      ],
    };
    expect(derivedText(turn)).toBe('preamble\n\nfinal answer');
  });

  it('AssistantTurn with no steps returns ""', () => {
    const turn: MessageType.AssistantTurn = {
      id: 't',
      type: 'assistant_turn',
      author: assistant,
      steps: [],
    };
    expect(derivedText(turn)).toBe('');
  });

  it('Image / File / Unsupported messages return ""', () => {
    expect(derivedText({id: '1', type: 'image', author: user, uri: 'x', name: 'x', size: 0} as any)).toBe('');
    expect(derivedText({id: '1', type: 'file', author: user, uri: 'x', name: 'x', size: 0} as any)).toBe('');
    expect(derivedText({id: '1', type: 'unsupported', author: user} as any)).toBe('');
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
    };
    const model = createModel({chatTemplate: chatTemplate});
    const result = await applyChatTemplate(conversationWSystem, model, null);
    expect(result).toBe(
      'System prompt. </s><|prompt|>Hi there!</s><|answer|>Nice to meet you!</s><|prompt|>Can I ask a question?</s><|answer|>',
    );
  });
});
