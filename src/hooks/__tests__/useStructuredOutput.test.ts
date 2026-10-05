import {renderHook, act} from '@testing-library/react-hooks';
import {useStructuredOutput} from '../useStructuredOutput';
import {modelStore} from '../../store';
import {GenerationSlot} from '../../store/generationLease';

jest.mock('../../store', () => {
  const {GenerationSlot: Slot} = jest.requireActual(
    '../../store/generationLease',
  );
  const store = {
    engine: undefined as any,
    activeModel: undefined,
    slot: new Slot(),
    tryAcquireGeneration: () => store.slot.tryAcquire(() => store.engine),
    abortActiveGeneration: () => store.slot.abortActive(),
    get isGenerationBusy() {
      return store.slot.isBusy;
    },
  };
  return {modelStore: store};
});

const store = modelStore as any;

function makeEngine() {
  return {
    completion: jest.fn(),
    stopCompletion: jest.fn().mockResolvedValue(undefined),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, resolve, reject};
}

describe('useStructuredOutput', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    store.slot = new GenerationSlot();
    store.engine = makeEngine();
    store.activeModel = undefined;
  });

  it('should generate structured output successfully', async () => {
    const mockResponse = {text: '{"key": "value"}'};
    store.engine.completion.mockResolvedValueOnce(mockResponse);

    const {result} = renderHook(() => useStructuredOutput());

    const prompt = 'test prompt';
    const schema = {type: 'object', properties: {key: {type: 'string'}}};

    let output;
    await act(async () => {
      output = await result.current.generate(prompt, schema);
    });

    expect(output).toEqual({key: 'value'});
    expect(result.current.isGenerating).toBe(false);
    expect(result.current.error).toBeNull();
    expect(store.engine.completion).toHaveBeenCalledWith({
      messages: [{role: 'user', content: prompt}],
      response_format: {
        type: 'json_schema',
        json_schema: {
          strict: true,
          schema,
        },
      },
      temperature: 0.2,
      top_p: 0.9,
      top_k: 40,
      n_predict: 2000,
      stop: undefined,
      enable_thinking: false,
    });
  });

  it('should handle custom options', async () => {
    const mockResponse = {text: '{"key": "value"}'};
    store.engine.completion.mockResolvedValueOnce(mockResponse);

    const {result} = renderHook(() => useStructuredOutput());

    const options = {
      temperature: 0.5,
      top_p: 0.8,
      top_k: 30,
      repeat_penalty: 1.1,
    };

    await act(async () => {
      await result.current.generate('test', {}, options);
    });

    expect(store.engine.completion).toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: options.temperature,
        top_p: options.top_p,
        top_k: options.top_k,
      }),
    );
  });

  it('should handle invalid JSON response', async () => {
    const mockResponse = {text: 'invalid json'};
    store.engine.completion.mockResolvedValueOnce(mockResponse);

    const {result} = renderHook(() => useStructuredOutput());

    let output;
    await act(async () => {
      output = await result.current.generate('test', {});
    });

    expect(output).toEqual({prompt: '', error: expect.any(Error)});
    expect(result.current.isGenerating).toBe(false);
  });

  it('rejects with modelNotInitialized when there is no engine and nothing runs', async () => {
    store.engine = undefined;

    const {result} = renderHook(() => useStructuredOutput());

    let error: any;
    await act(async () => {
      try {
        await result.current.generate('test', {});
      } catch (e) {
        error = e;
      }
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Model context not initialized');
    expect(result.current.isGenerating).toBe(false);
    expect(result.current.isBusy).toBe(false);
  });

  it('ends the lease when the completion rejects', async () => {
    const errorMessage = 'Completion failed';
    store.engine.completion.mockRejectedValueOnce(new Error(errorMessage));

    const {result} = renderHook(() => useStructuredOutput());

    let error: any;
    await act(async () => {
      try {
        await result.current.generate('test', {});
      } catch (e) {
        error = e;
      }
    });

    expect(error.message).toBe(errorMessage);
    expect(result.current.isGenerating).toBe(false);
    expect(result.current.error).toBe(errorMessage);
    expect(modelStore.isGenerationBusy).toBe(false);
    const next = modelStore.tryAcquireGeneration();
    expect(next).not.toBeNull();
    next?.end();
  });

  describe('under the generation lease', () => {
    async function startGeneration() {
      const pending = deferred<{text: string}>();
      const granted = store.engine;
      granted.completion.mockReturnValueOnce(pending.promise);
      const hook = renderHook(() => useStructuredOutput());
      let output: Promise<unknown>;
      act(() => {
        output = hook.result.current.generate('test', {});
      });
      return {hook, granted, pending, output: () => output};
    }

    it('holds the lease and completes on the granted engine', async () => {
      const {hook, granted, pending, output} = await startGeneration();
      expect(modelStore.isGenerationBusy).toBe(true);
      expect(hook.result.current.isGenerating).toBe(true);

      const swapped = makeEngine();
      store.engine = swapped;
      act(() => hook.result.current.stop());
      expect(granted.stopCompletion).toHaveBeenCalledTimes(1);
      expect(swapped.stopCompletion).not.toHaveBeenCalled();

      await act(async () => {
        pending.resolve({text: '{"prompt": "partial"}'});
        await output();
      });

      expect(granted.completion).toHaveBeenCalledTimes(1);
      expect(swapped.completion).not.toHaveBeenCalled();
      expect(modelStore.isGenerationBusy).toBe(false);
      const next = modelStore.tryAcquireGeneration();
      expect(next).not.toBeNull();
      next?.end();
    });

    it('stop() ends the completion once and keeps the partial result', async () => {
      const {hook, granted, pending, output} = await startGeneration();

      act(() => hook.result.current.stop());
      let result: unknown;
      await act(async () => {
        pending.resolve({text: '{"prompt": "partial"}'});
        result = await output();
      });

      expect(granted.stopCompletion).toHaveBeenCalledTimes(1);
      expect(result).toEqual({prompt: 'partial'});
    });

    it('cancel() ends the completion once and returns nothing', async () => {
      const {hook, granted, pending, output} = await startGeneration();

      act(() => hook.result.current.cancel());
      let result: unknown = 'unset';
      await act(async () => {
        pending.resolve({text: '{"prompt": "partial"}'});
        result = await output();
      });

      expect(granted.stopCompletion).toHaveBeenCalledTimes(1);
      expect(result).toBeUndefined();
    });

    it('unmounting ends the completion once and returns nothing', async () => {
      const {hook, granted, pending, output} = await startGeneration();

      hook.unmount();
      pending.resolve({text: '{"prompt": "partial"}'});
      const result = await output();

      expect(granted.stopCompletion).toHaveBeenCalledTimes(1);
      expect(result).toBeUndefined();
      expect(modelStore.isGenerationBusy).toBe(false);
    });

    it('a release aborts it with one stop', async () => {
      const {granted, pending, output} = await startGeneration();

      modelStore.abortActiveGeneration();
      expect(granted.stopCompletion).toHaveBeenCalledTimes(1);

      await act(async () => {
        pending.resolve({text: '{"prompt": "partial"}'});
        await output();
      });
      expect(modelStore.isGenerationBusy).toBe(false);
    });

    it('a stopCompletion that throws synchronously never escapes stop or a release', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const {hook, granted, pending, output} = await startGeneration();
      granted.stopCompletion.mockImplementation(() => {
        throw new Error('Context not found');
      });

      expect(() => act(() => hook.result.current.stop())).not.toThrow();
      expect(() => modelStore.abortActiveGeneration()).not.toThrow();

      await act(async () => {
        pending.resolve({text: '{}'});
        await output();
      });
      warn.mockRestore();
    });

    it('generates nothing while another generation holds the lease', async () => {
      const held = modelStore.tryAcquireGeneration();
      const {result} = renderHook(() => useStructuredOutput());

      let output: unknown = 'unset';
      await act(async () => {
        output = await result.current.generate('test', {});
      });

      expect(output).toBeUndefined();
      expect(store.engine.completion).not.toHaveBeenCalled();
      expect(store.engine.stopCompletion).not.toHaveBeenCalled();
      expect(result.current.isBusy).toBe(true);
      expect(result.current.isGenerating).toBe(false);

      act(() => result.current.cancel());
      expect(result.current.isBusy).toBe(false);
      held?.end();
    });

    it('cancel() with nothing running does not swallow the next result', async () => {
      store.engine.completion.mockResolvedValueOnce({text: '{"prompt": "p"}'});
      const {result} = renderHook(() => useStructuredOutput());

      act(() => result.current.cancel());
      let output: unknown;
      await act(async () => {
        output = await result.current.generate('test', {});
      });

      expect(output).toEqual({prompt: 'p'});
    });
  });
});
