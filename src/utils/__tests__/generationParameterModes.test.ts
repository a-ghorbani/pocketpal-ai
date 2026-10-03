import {
  applyGenerationParameterModes,
  mergeCompletionParameterLayers,
} from '../generationParameterModes';
import type {ApiCompletionParams, CompletionParams} from '../completionTypes';

const owns = (value: object, key: PropertyKey) =>
  Object.prototype.hasOwnProperty.call(value, key);

describe('generation parameter modes', () => {
  it.each([
    ['temperature', 0],
    ['top_k', 0],
    ['top_p', 0],
    ['min_p', 0],
    ['xtc_threshold', 0],
    ['xtc_probability', 0],
    ['typical_p', 0],
    ['penalty_last_n', -1],
    ['penalty_repeat', 0],
    ['penalty_freq', 0],
    ['penalty_present', 0],
    ['mirostat', 0],
    ['mirostat_tau', 0],
    ['mirostat_eta', 0],
    ['seed', -1],
    ['n_probs', 0],
    ['n_predict', -1],
    ['stop', []],
    ['jinja', false],
    ['enable_thinking', false],
  ] as const)('keeps explicit Send value for %s', (key, value) => {
    const input: ApiCompletionParams = {
      [key]: value,
      generationParameterModes: {[key]: 'send'},
    };

    const result = applyGenerationParameterModes(input);

    expect(owns(result, key)).toBe(true);
    expect(result[key]).toEqual(value);
    expect(owns(result, 'generationParameterModes')).toBe(false);
  });

  it.each([
    'temperature',
    'top_k',
    'top_p',
    'min_p',
    'xtc_threshold',
    'xtc_probability',
    'typical_p',
    'penalty_last_n',
    'penalty_repeat',
    'penalty_freq',
    'penalty_present',
    'mirostat',
    'mirostat_tau',
    'mirostat_eta',
    'seed',
    'n_probs',
    'n_predict',
    'stop',
    'jinja',
    'enable_thinking',
  ] as const)('removes explicit Omit property for %s', key => {
    const input: ApiCompletionParams = {
      [key]: key === 'stop' ? ['END'] : 1,
      generationParameterModes: {[key]: 'omit'},
    };

    const result = applyGenerationParameterModes(input);

    expect(owns(result, key)).toBe(false);
  });

  it('suppresses nested reasoning aliases without mutating input', () => {
    const input: ApiCompletionParams = {
      reasoning: {enabled: true, effort: 'high'},
      reasoning_format: 'auto',
      reasoning_effort: 'high',
      chat_template_kwargs: {
        enable_thinking: false,
        reasoning_effort: 'high',
        retained: true,
      },
      generationParameterModes: {reasoning: 'omit'},
    };

    const result = applyGenerationParameterModes(input);

    expect(owns(result, 'reasoning')).toBe(false);
    expect(owns(result, 'reasoning_format')).toBe(false);
    expect(owns(result, 'reasoning_effort')).toBe(false);
    expect(result.chat_template_kwargs).toEqual({retained: true});
    expect(input.reasoning).toEqual({enabled: true, effort: 'high'});
    expect(input.chat_template_kwargs).toEqual({
      enable_thinking: false,
      reasoning_effort: 'high',
      retained: true,
    });
  });

  it('resolves system to global to Pal to model to session precedence', () => {
    const layers: CompletionParams[] = [
      {temperature: 0.1},
      {temperature: 0.2, generationParameterModes: {temperature: 'send'}},
      {temperature: 0.3, generationParameterModes: {temperature: 'inherit'}},
      {temperature: 0.4, generationParameterModes: {temperature: 'omit'}},
      {temperature: 0.5, generationParameterModes: {temperature: 'inherit'}},
    ];

    const result = mergeCompletionParameterLayers(...layers);

    expect(result.temperature).toBe(0.4);
    expect(result.generationParameterModes?.temperature).toBe('omit');
    expect(layers[4].temperature).toBe(0.5);
  });

  it('preserves legacy scalar override behavior when no field mode exists', () => {
    const result = mergeCompletionParameterLayers(
      {temperature: 0.1, generationParameterModes: {temperature: 'omit'}},
      {temperature: 0},
    );

    expect(result.temperature).toBe(0);
    expect(result.generationParameterModes?.temperature).toBeUndefined();
    expect(owns(applyGenerationParameterModes(result), 'temperature')).toBe(
      true,
    );
  });

  it('inherits nested reasoning effort while retaining the overriding enabled state', () => {
    const result = mergeCompletionParameterLayers(
      {
        reasoning: {enabled: true, effort: 'low'},
        generationParameterModes: {reasoning_effort: 'send'},
      },
      {
        reasoning: {enabled: false, effort: 'high'},
        generationParameterModes: {reasoning_effort: 'inherit'},
      },
    );

    expect(result.reasoning).toEqual({enabled: false, effort: 'low'});
    expect(result.generationParameterModes?.reasoning_effort).toBe('send');
  });

  it('removes an inherited effort when the lower layer does not define one', () => {
    const result = mergeCompletionParameterLayers(
      {reasoning: {enabled: true}},
      {
        reasoning: {enabled: false, effort: 'high'},
        generationParameterModes: {reasoning_effort: 'inherit'},
      },
    );

    expect(result.reasoning).toEqual({enabled: false});
    expect(result.generationParameterModes?.reasoning_effort).toBeUndefined();
  });

  it('removes derived aliases and empty template kwargs for omitted fields', () => {
    const result = applyGenerationParameterModes({
      n_predict: 256,
      max_tokens: 256,
      max_completion_tokens: 256,
      max_output_tokens: 256,
      penalty_last_n: 64,
      repeat_last_n: 64,
      penalty_repeat: 1.2,
      repeat_penalty: 1.2,
      reasoning: {enabled: true, effort: 'high'},
      reasoning_effort: 'high',
      chat_template_kwargs: {reasoning_effort: 'high'},
      generationParameterModes: {
        n_predict: 'omit',
        penalty_last_n: 'omit',
        penalty_repeat: 'omit',
        reasoning_effort: 'omit',
      },
    });

    expect(result).not.toHaveProperty('n_predict');
    expect(result).not.toHaveProperty('max_tokens');
    expect(result).not.toHaveProperty('max_completion_tokens');
    expect(result).not.toHaveProperty('max_output_tokens');
    expect(result).not.toHaveProperty('penalty_last_n');
    expect(result).not.toHaveProperty('repeat_last_n');
    expect(result).not.toHaveProperty('penalty_repeat');
    expect(result).not.toHaveProperty('repeat_penalty');
    expect(result.reasoning).toEqual({enabled: true});
    expect(result).not.toHaveProperty('reasoning_effort');
    expect(result).not.toHaveProperty('chat_template_kwargs');
  });

  it('treats unresolved inherit as omission at the engine boundary', () => {
    const result = applyGenerationParameterModes({
      include_thinking_in_context: false,
      enable_thinking: false,
      generationParameterModes: {
        include_thinking_in_context: 'inherit',
        enable_thinking: 'inherit',
      },
    });

    expect(result).not.toHaveProperty('include_thinking_in_context');
    expect(result).not.toHaveProperty('enable_thinking');
  });
});
