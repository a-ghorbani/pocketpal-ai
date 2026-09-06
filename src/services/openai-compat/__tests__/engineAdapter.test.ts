import {modelStore} from '../../../store';
import {
  EngineAdapter,
  EngineUnavailableError,
  hasDeltaPayload,
  StreamDeltaTracker,
} from '../engineAdapter';

describe('StreamDeltaTracker', () => {
  it('passes through content and reasoning deltas', () => {
    const tracker = new StreamDeltaTracker();
    const delta = tracker.next(
      {content: 'abc', reasoning_content: 'thinking'} as any,
      {allowTokenFallback: true},
    );
    expect(delta.content).toBe('abc');
    expect(delta.reasoning_content).toBe('thinking');
  });

  it('falls back to raw token when no parsed payload', () => {
    const tracker = new StreamDeltaTracker();
    const delta = tracker.next({token: 'x'} as any, {
      allowTokenFallback: true,
    });
    expect(delta.content).toBe('x');
  });

  it('does not fall back to raw token when tools are present', () => {
    const tracker = new StreamDeltaTracker();
    const delta = tracker.next({token: '<tool_call>'} as any, {
      allowTokenFallback: false,
    });
    expect(delta.content).toBeUndefined();
  });

  it('emits full first tool call then argument-only diffs', () => {
    const tracker = new StreamDeltaTracker();

    const first = tracker.next(
      {
        tool_calls: [
          {
            id: 'c1',
            function: {name: 'get_weather', arguments: '{"city"'},
          },
        ],
      } as any,
      {allowTokenFallback: false},
    );
    expect(first.tool_calls).toEqual([
      {
        index: 0,
        id: 'c1',
        type: 'function',
        function: {name: 'get_weather', arguments: '{"city"'},
      },
    ]);

    const second = tracker.next(
      {
        tool_calls: [
          {
            id: 'c1',
            function: {name: 'get_weather', arguments: '{"city": "SF"}'},
          },
        ],
      } as any,
      {allowTokenFallback: false},
    );
    expect(second.tool_calls).toEqual([
      {index: 0, function: {arguments: ': "SF"}'}},
    ]);
  });

  it('handles new tool calls appearing mid-stream', () => {
    const tracker = new StreamDeltaTracker();
    tracker.next(
      {tool_calls: [{id: 'c1', function: {name: 'a', arguments: '1'}}]} as any,
      {allowTokenFallback: false},
    );
    const delta = tracker.next(
      {
        tool_calls: [
          {id: 'c1', function: {name: 'a', arguments: '1'}},
          {id: 'c2', function: {name: 'b', arguments: '2'}},
        ],
      } as any,
      {allowTokenFallback: false},
    );
    expect(delta.tool_calls).toEqual([
      {
        index: 1,
        id: 'c2',
        type: 'function',
        function: {name: 'b', arguments: '2'},
      },
    ]);
  });

  it('reset clears previous tool call snapshots', () => {
    const tracker = new StreamDeltaTracker();
    tracker.next(
      {tool_calls: [{id: 'c1', function: {name: 'a', arguments: '1'}}]} as any,
      {allowTokenFallback: false},
    );
    tracker.reset();
    const delta = tracker.next(
      {tool_calls: [{id: 'c1', function: {name: 'a', arguments: '12'}}]} as any,
      {allowTokenFallback: false},
    );
    expect(delta.tool_calls![0].function?.arguments).toBe('12');
  });
});

describe('hasDeltaPayload', () => {
  it('is false for empty deltas', () => {
    expect(hasDeltaPayload({})).toBe(false);
    expect(hasDeltaPayload({content: ''})).toBe(false);
    expect(hasDeltaPayload({tool_calls: []} as any)).toBe(false);
  });

  it('is true when any payload present', () => {
    expect(hasDeltaPayload({content: 'x'})).toBe(true);
    expect(hasDeltaPayload({reasoning_content: 'y'})).toBe(true);
    expect(hasDeltaPayload({tool_calls: [{index: 0}]} as any)).toBe(true);
  });
});

describe('EngineAdapter', () => {
  const createAdapter = () => new EngineAdapter();

  afterEach(() => {
    modelStore.inferencing = false;
    modelStore.isStreaming = false;
    modelStore.isContextLoading = false;
    modelStore.context = undefined;
    jest.clearAllMocks();
  });

  it('throws EngineUnavailableError when context is missing', async () => {
    const adapter = createAdapter();
    await expect(
      adapter.chatCompletion({messages: [{role: 'user', content: 'hi'}]}),
    ).rejects.toBeInstanceOf(EngineUnavailableError);
  });

  it('runs completion and maps result, managing engine flags', async () => {
    const adapter = createAdapter();
    const nativeResult = {
      content: 'Hello!',
      reasoning_content: '',
      tool_calls: [],
      tokens_evaluated: 10,
      tokens_predicted: 4,
      stopped_limit: false,
    };
    let inferencingDuringRun: boolean | null = null;
    let streamingDuringRun: boolean | null = null;
    const completion = jest.fn().mockImplementation(async () => {
      inferencingDuringRun = modelStore.inferencing;
      streamingDuringRun = modelStore.isStreaming;
      return nativeResult;
    });
    modelStore.context = {completion} as any;

    const registerCalls: any[] = [];
    const clearCalls: number[] = [];
    const originalRegister = modelStore.registerCompletionPromise;
    const originalClear = modelStore.clearCompletionPromise;
    (modelStore as any).registerCompletionPromise = (promise: Promise<any>) => {
      registerCalls.push(promise);
      return originalRegister(promise);
    };
    (modelStore as any).clearCompletionPromise = () => {
      clearCalls.push(1);
      return originalClear();
    };

    try {
      const result = await adapter.chatCompletion({
        messages: [{role: 'user', content: 'hi'}],
        temperature: 0.3,
      });

      expect(result.content).toBe('Hello!');
      expect(result.finish_reason).toBe('stop');
      expect(result.usage.total_tokens).toBe(14);
      expect(completion).toHaveBeenCalledTimes(1);
      expect(completion.mock.calls[0][0].temperature).toBe(0.3);
      expect(inferencingDuringRun).toBe(true);
      expect(streamingDuringRun).toBe(true);
      expect(modelStore.inferencing).toBe(false);
      expect(modelStore.isStreaming).toBe(false);
      expect(registerCalls).toHaveLength(1);
      expect(clearCalls).toHaveLength(1);
    } finally {
      (modelStore as any).registerCompletionPromise = originalRegister;
      (modelStore as any).clearCompletionPromise = originalClear;
    }
  });

  it('clears engine flags even when completion fails', async () => {
    const adapter = createAdapter();
    modelStore.context = {
      completion: jest.fn().mockRejectedValue(new Error('boom')),
    } as any;

    await expect(
      adapter.chatCompletion({messages: [{role: 'user', content: 'hi'}]}),
    ).rejects.toThrow('boom');
    expect(modelStore.inferencing).toBe(false);
    expect(modelStore.isStreaming).toBe(false);
  });

  it('serializes FIFO requests through the queue', async () => {
    const adapter = createAdapter();
    let resolveFirst: (value: any) => void = () => {};
    const callOrder: string[] = [];

    const completion = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(async () => {
        callOrder.push('second');
        return {content: 'b', tokens_evaluated: 1, tokens_predicted: 1};
      });
    modelStore.context = {completion} as any;

    const first = adapter.chatCompletion({
      messages: [{role: 'user', content: 'first'}],
    });
    const second = adapter.chatCompletion({
      messages: [{role: 'user', content: 'second'}],
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(callOrder).not.toContain('second');

    resolveFirst({content: 'a', tokens_evaluated: 1, tokens_predicted: 1});
    const [resultA, resultB] = await Promise.all([first, second]);
    expect(resultA.content).toBe('a');
    expect(resultB.content).toBe('b');
    expect(callOrder).toEqual(['second']);
  });

  it('streams deltas from token callback', async () => {
    const adapter = createAdapter();
    const deltas: any[] = [];
    let onTokenCallback: ((data: any) => void) | undefined;

    const completion = jest.fn().mockImplementation((_params, onToken) => {
      onTokenCallback = onToken;
      return new Promise(resolve => {
        onToken({content: 'He'} as any);
        onToken({content: 'llo'} as any);
        resolve({content: 'Hello', tokens_evaluated: 1, tokens_predicted: 2});
      });
    });
    modelStore.context = {completion} as any;

    const result = await adapter.streamChatCompletion(
      {messages: [{role: 'user', content: 'hi'}]},
      delta => deltas.push(delta),
    );

    expect(onTokenCallback).toBeDefined();
    expect(deltas).toEqual([{content: 'He'}, {content: 'llo'}]);
    expect(result.content).toBe('Hello');
  });

  it('does not emit empty deltas during streaming', async () => {
    const adapter = createAdapter();
    const deltas: any[] = [];

    modelStore.context = {
      completion: jest.fn().mockImplementation((_params, onToken) => {
        onToken({token: ''} as any);
        onToken({content: 'x'} as any);
        return Promise.resolve({content: 'x'});
      }),
    } as any;

    await adapter.streamChatCompletion(
      {messages: [{role: 'user', content: 'hi'}]},
      delta => deltas.push(delta),
    );
    expect(deltas).toEqual([{content: 'x'}]);
  });

  it('waits until the engine is free before running', async () => {
    jest.useFakeTimers();
    try {
      const adapter = createAdapter();
      modelStore.inferencing = true;
      modelStore.context = {
        completion: jest.fn().mockResolvedValue({content: 'ok'}),
      } as any;

      let settled = false;
      const promise = adapter
        .chatCompletion({messages: [{role: 'user', content: 'hi'}]})
        .then(result => {
          settled = true;
          return result;
        });

      await jest.advanceTimersByTimeAsync(150);
      expect(settled).toBe(false);

      modelStore.inferencing = false;
      await jest.advanceTimersByTimeAsync(200);
      const result = await promise;
      expect(settled).toBe(true);
      expect(result.content).toBe('ok');
    } finally {
      jest.useRealTimers();
    }
  });
});
