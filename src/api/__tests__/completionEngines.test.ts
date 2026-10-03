import {LlamaContext} from 'llama.rn';

import {
  LocalCompletionEngine,
  OpenAICompletionEngine,
} from '../completionEngines';
import * as openaiModule from '../openai';

jest.mock('../openai', () => ({
  streamChatCompletion: jest.fn(),
}));

const mockedStreamChat = openaiModule.streamChatCompletion as jest.Mock;

describe('LocalCompletionEngine', () => {
  let mockContext: LlamaContext;
  let engine: LocalCompletionEngine;

  beforeEach(() => {
    jest.clearAllMocks();
    mockContext = new LlamaContext({contextId: 1} as any);
    engine = new LocalCompletionEngine(mockContext);
  });

  it('delegates completion call to LlamaContext', async () => {
    const mockResult = {
      text: 'Hello world',
      content: 'Hello world',
      reasoning_content: undefined,
      timings: {predicted_per_second: 50},
      tokens_predicted: 2,
      tokens_evaluated: 5,
      truncated: false,
      stopped_eos: true,
      stopped_limit: 0,
      stopped_word: '',
      stopping_word: '',
      context_full: false,
      interrupted: false,
    };

    (mockContext.completion as jest.Mock).mockResolvedValueOnce(mockResult);

    const params = {
      messages: [{role: 'user', content: 'Hello'}],
      temperature: 0.7,
    } as any;

    const result = await engine.completion(params);

    expect(mockContext.completion).toHaveBeenCalledWith(params, undefined);
    expect(result.text).toBe('Hello world');
    expect(result.content).toBe('Hello world');
    expect(result.stopped_eos).toBe(true);
    expect(result.tokens_predicted).toBe(2);
    expect(result.timings).toEqual({predicted_per_second: 50});
  });

  it('carries speculative draft_tokens counters from the native result', async () => {
    const mockResult = {
      text: 'spec',
      content: 'spec',
      timings: {predicted_per_second: 80},
      tokens_predicted: 10,
      tokens_evaluated: 4,
      draft_tokens: 12,
      draft_tokens_accepted: 9,
      truncated: false,
      stopped_eos: true,
    };

    (mockContext.completion as jest.Mock).mockResolvedValueOnce(mockResult);

    const result = await engine.completion({} as any);

    expect(result.draft_tokens).toBe(12);
    expect(result.draft_tokens_accepted).toBe(9);
  });

  it('leaves draft_tokens undefined when the native result omits them', async () => {
    const mockResult = {
      text: 'no-spec',
      content: 'no-spec',
      tokens_predicted: 3,
    };

    (mockContext.completion as jest.Mock).mockResolvedValueOnce(mockResult);

    const result = await engine.completion({} as any);

    expect(result.draft_tokens).toBeUndefined();
    expect(result.draft_tokens_accepted).toBeUndefined();
  });

  it('passes callback to LlamaContext and maps token data', async () => {
    const mockResult = {
      text: 'result',
      content: 'result',
    };

    (mockContext.completion as jest.Mock).mockImplementationOnce(
      async (params: any, cb: any) => {
        // Simulate LlamaContext calling the callback with TokenData shape
        cb({token: 'tok', content: 'tok', reasoning_content: 'think'});
        return mockResult;
      },
    );

    const onToken = jest.fn();
    await engine.completion({} as any, onToken);

    expect(onToken).toHaveBeenCalledWith({
      token: 'tok',
      content: 'tok',
      reasoning_content: 'think',
    });
  });

  it('does not pass callback when none provided', async () => {
    (mockContext.completion as jest.Mock).mockResolvedValueOnce({
      text: '',
      content: '',
    });

    await engine.completion({} as any);

    expect(mockContext.completion).toHaveBeenCalledWith(
      expect.anything(),
      undefined,
    );
  });

  it('delegates stopCompletion to LlamaContext', async () => {
    await engine.stopCompletion();
    expect(mockContext.stopCompletion).toHaveBeenCalled();
  });
});

describe('OpenAICompletionEngine', () => {
  let engine: OpenAICompletionEngine;

  beforeEach(() => {
    jest.clearAllMocks();
    engine = new OpenAICompletionEngine(
      'http://localhost:1234',
      'test-model',
      'sk-key',
    );
  });

  it('calls streamChatCompletion with correct parameters', async () => {
    const mockResult = {
      text: 'Hello',
      content: 'Hello',
      tokens_predicted: 1,
    };
    mockedStreamChat.mockResolvedValueOnce(mockResult);

    const onToken = jest.fn();
    const params = {
      messages: [{role: 'user', content: 'Hi'}],
      temperature: 0.8,
      top_p: 0.95,
      n_predict: 200,
      stop: ['</s>'],
    } as any;

    const result = await engine.completion(params, onToken);

    expect(mockedStreamChat).toHaveBeenCalledWith(
      {
        messages: [{role: 'user', content: 'Hi'}],
        model: 'test-model',
        temperature: 0.8,
        top_p: 0.95,
        max_tokens: 200,
        stop: ['</s>'],
        stream: true,
        reasoning: undefined,
      },
      'http://localhost:1234',
      'sk-key',
      expect.any(Object), // AbortSignal
      onToken,
      undefined, // timeoutMs
      undefined, // serverType
    );

    expect(result).toEqual(mockResult);
  });

  // PACT support requires the engine to forward tools and tool_choice
  // down to streamChatCompletion. Without this, any Pal with talents
  // enabled silently degrades to text-only on remote engines (no tools
  // schemas → no tool_calls).
  it('forwards tools and tool_choice to streamChatCompletion', async () => {
    mockedStreamChat.mockResolvedValueOnce({text: '', content: ''});

    const calculateTool = {
      type: 'function' as const,
      function: {
        name: 'calculate',
        description: 'Evaluate a math expression',
        parameters: {
          type: 'object',
          properties: {expression: {type: 'string'}},
          required: ['expression'],
        },
      },
    };
    const params = {
      messages: [{role: 'user', content: 'What is 2+2?'}],
      tools: [calculateTool],
      tool_choice: 'auto',
    } as any;

    await engine.completion(params);

    expect(mockedStreamChat).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: [calculateTool],
        tool_choice: 'auto',
      }),
      'http://localhost:1234',
      'sk-key',
      expect.any(Object),
      undefined,
      undefined,
      undefined,
    );
  });

  // Structured-output (json_schema response_format) is provider-agnostic:
  // local goes through llama.rn natively, remote needs response_format
  // forwarded down to the OpenAI request body.
  it('forwards response_format to streamChatCompletion', async () => {
    mockedStreamChat.mockResolvedValueOnce({text: '{}', content: '{}'});

    const responseFormat = {
      type: 'json_schema' as const,
      json_schema: {
        strict: true,
        schema: {type: 'object', properties: {name: {type: 'string'}}},
      },
    };
    const params = {
      messages: [{role: 'user', content: 'give me a name'}],
      response_format: responseFormat,
    } as any;

    await engine.completion(params);

    expect(mockedStreamChat).toHaveBeenCalledWith(
      expect.objectContaining({response_format: responseFormat}),
      'http://localhost:1234',
      'sk-key',
      expect.any(Object),
      undefined,
      undefined,
      undefined,
    );
  });

  it('handles missing optional params gracefully', async () => {
    mockedStreamChat.mockResolvedValueOnce({
      text: '',
      content: '',
    });

    const params = {
      messages: [{role: 'user', content: 'Hi'}],
    } as any;

    await engine.completion(params);

    expect(mockedStreamChat).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{role: 'user', content: 'Hi'}],
        model: 'test-model',
        temperature: undefined,
        top_p: undefined,
        max_tokens: undefined,
        stop: undefined,
        stream: true,
      }),
      'http://localhost:1234',
      'sk-key',
      expect.any(Object),
      undefined,
      undefined,
      undefined,
    );
  });

  it('stopCompletion aborts the active request', async () => {
    // Start a completion that will be aborted
    let capturedSignal: AbortSignal | undefined;
    mockedStreamChat.mockImplementation(
      async (_p: any, _u: any, _k: any, signal: AbortSignal) => {
        capturedSignal = signal;
        return {text: '', content: ''};
      },
    );

    await engine.completion({messages: [{role: 'user', content: 'Hi'}]} as any);

    expect(capturedSignal).toBeDefined();
    expect(capturedSignal!.aborted).toBe(false);

    await engine.stopCompletion();

    expect(capturedSignal!.aborted).toBe(true);
  });

  it('stopCompletion is safe to call when no active request', async () => {
    // Should not throw
    await engine.stopCompletion();
  });

  // The engine carries the timeoutMs it was constructed with and forwards it
  // raw (no normalization here) to streamChatCompletion. A rebuilt engine (on
  // the next setRemoteModel) therefore applies an edited value.
  it('forwards the constructed timeoutMs to streamChatCompletion', async () => {
    const timedEngine = new OpenAICompletionEngine(
      'http://localhost:1234',
      'test-model',
      'sk-key',
      600000,
    );
    mockedStreamChat.mockResolvedValueOnce({text: '', content: ''});

    await timedEngine.completion({
      messages: [{role: 'user', content: 'Hi'}],
    } as any);

    expect(mockedStreamChat).toHaveBeenCalledWith(
      expect.any(Object),
      'http://localhost:1234',
      'sk-key',
      expect.any(Object), // AbortSignal
      undefined, // callback
      600000, // raw timeoutMs forwarded, not normalized
      undefined, // serverType
    );
  });

  it('creates engine without api key', () => {
    const noKeyEngine = new OpenAICompletionEngine(
      'http://localhost:1234',
      'model-id',
    );

    mockedStreamChat.mockResolvedValueOnce({text: '', content: ''});

    noKeyEngine.completion({messages: [{role: 'user', content: 'Hi'}]} as any);

    expect(mockedStreamChat).toHaveBeenCalledWith(
      expect.any(Object),
      'http://localhost:1234',
      undefined,
      expect.any(Object),
      undefined,
      undefined,
      undefined,
    );
  });

  it('forwards params.reasoning and the constructed serverType', async () => {
    const typedEngine = new OpenAICompletionEngine(
      'http://localhost:1234',
      'test-model',
      'sk-key',
      undefined,
      'Ollama',
    );
    mockedStreamChat.mockResolvedValueOnce({text: '', content: ''});

    await typedEngine.completion({
      messages: [{role: 'user', content: 'Hi'}],
      reasoning: {enabled: false},
    } as any);

    expect(mockedStreamChat).toHaveBeenCalledWith(
      expect.objectContaining({reasoning: {enabled: false}}),
      'http://localhost:1234',
      'sk-key',
      expect.any(Object),
      undefined,
      undefined,
      'Ollama',
    );
  });
});
