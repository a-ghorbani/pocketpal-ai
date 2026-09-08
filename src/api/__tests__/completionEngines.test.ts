import {LlamaContext} from 'llama.rn';

import {LocalCompletionEngine} from '../completionEngines';

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
