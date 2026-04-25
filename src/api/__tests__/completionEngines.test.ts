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
      },
      'http://localhost:1234',
      'sk-key',
      expect.any(Object), // AbortSignal
      onToken,
    );

    expect(result).toEqual(mockResult);
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
    );
  });
});
