import {renderHook, act} from '@testing-library/react-hooks';
import {useStructuredOutput} from '../useStructuredOutput';
import {chatSessionStore, modelStore} from '../../store';

jest.mock('../../store', () => ({
  chatSessionStore: {
    getCurrentCompletionSettings: jest.fn().mockResolvedValue({}),
  },
  modelStore: {
    engine: {
      completion: jest.fn(),
      stopCompletion: jest.fn(),
    },
    activeModel: undefined,
  },
}));

describe('useStructuredOutput', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (modelStore as any).engine = {
      completion: jest.fn(),
      stopCompletion: jest.fn().mockResolvedValue(undefined),
    };
    (modelStore as any).activeModel = undefined;
    (modelStore as any).activeModelCompletionSettings = undefined;
  });

  it('should generate structured output successfully', async () => {
    const mockResponse = {text: '{"key": "value"}'};
    (modelStore.engine!.completion as jest.Mock).mockResolvedValueOnce(
      mockResponse,
    );

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
    expect(modelStore.engine!.completion).toHaveBeenCalledWith({
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
    (modelStore.engine!.completion as jest.Mock).mockResolvedValueOnce(
      mockResponse,
    );

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

    expect(modelStore.engine!.completion).toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: options.temperature,
        top_p: options.top_p,
        top_k: options.top_k,
      }),
    );
  });

  it('forwards resolved generation modes without mutating the resolved settings', async () => {
    const resolved = {
      temperature: 0.7,
      seed: -1,
      generationParameterModes: {
        temperature: 'omit',
        seed: 'send',
      },
    };
    (
      chatSessionStore.getCurrentCompletionSettings as jest.Mock
    ).mockResolvedValueOnce(resolved);
    (modelStore as any).activeModelCompletionSettings = {
      temperature: 0.7,
    };
    (modelStore.engine!.completion as jest.Mock).mockResolvedValueOnce({
      text: '{"key":"value"}',
    });
    const {result} = renderHook(() => useStructuredOutput());

    await act(async () => {
      await result.current.generate('test', {});
    });

    expect(chatSessionStore.getCurrentCompletionSettings).toHaveBeenCalledWith({
      temperature: 0.7,
    });
    expect(modelStore.engine!.completion).toHaveBeenCalledWith(
      expect.objectContaining({
        seed: -1,
        generationParameterModes: {
          temperature: 'omit',
          seed: 'send',
        },
      }),
    );
    expect(resolved).toEqual({
      temperature: 0.7,
      seed: -1,
      generationParameterModes: {
        temperature: 'omit',
        seed: 'send',
      },
    });
  });

  it('stops an in-flight request without awaiting the completion result', async () => {
    let resolveCompletion!: (value: {text: string}) => void;
    (modelStore.engine!.completion as jest.Mock).mockReturnValueOnce(
      new Promise(resolve => {
        resolveCompletion = resolve;
      }),
    );
    const {result} = renderHook(() => useStructuredOutput());
    let generation!: Promise<unknown>;

    act(() => {
      generation = result.current.generate('test', {});
    });
    await act(async () => {
      await Promise.resolve();
      result.current.stop();
    });

    expect(modelStore.engine!.stopCompletion).toHaveBeenCalledTimes(1);
    expect(result.current.isGenerating).toBe(false);

    await act(async () => {
      resolveCompletion({text: '{}'});
      await generation;
    });
  });

  it('rejects invalid JSON response', async () => {
    const mockResponse = {text: 'invalid json'};
    (modelStore.engine!.completion as jest.Mock).mockResolvedValueOnce(
      mockResponse,
    );

    const {result} = renderHook(() => useStructuredOutput());

    let error;
    await act(async () => {
      try {
        await result.current.generate('test', {});
      } catch (caught) {
        error = caught;
      }
    });

    expect(error).toBeInstanceOf(Error);
    expect(result.current.isGenerating).toBe(false);
  });

  it.each([
    {
      text: '{}',
      terminal_status: 'incomplete',
      incomplete_reason: 'max_output_tokens',
      interrupted: true,
    },
    {
      text: 'No',
      terminal_status: 'incomplete',
      refusal: 'No',
      interrupted: true,
    },
  ])('rejects non-completed Responses output', async completionResult => {
    (modelStore.engine!.completion as jest.Mock).mockResolvedValueOnce(
      completionResult,
    );
    const {result} = renderHook(() => useStructuredOutput());

    await expect(
      act(async () => result.current.generate('test', {})),
    ).rejects.toThrow();
    expect(result.current.isGenerating).toBe(false);
  });

  it('should handle uninitialized completion engine', async () => {
    (modelStore as any).engine = undefined;

    const {result} = renderHook(() => useStructuredOutput());

    let error;
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
  });

  it('should handle completion error', async () => {
    const errorMessage = 'Completion failed';
    (modelStore.engine!.completion as jest.Mock).mockRejectedValueOnce(
      new Error(errorMessage),
    );

    const {result} = renderHook(() => useStructuredOutput());

    let error;
    await act(async () => {
      try {
        await result.current.generate('test', {});
      } catch (e) {
        error = e;
      }
    });

    expect(error).toBeDefined();
    expect(error.message).toBe(errorMessage);
    expect(result.current.isGenerating).toBe(false);
    expect(result.current.error).toBe(errorMessage);
  });
});
