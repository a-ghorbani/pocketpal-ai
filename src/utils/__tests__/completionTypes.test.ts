import {cacheReuseTimings} from '../../../jest/fixtures/llamaServerTimings';
import {LlamaContext} from 'llama.rn';

import {mockLlamaContextParams} from '../../../jest/fixtures/models';
import {LocalCompletionEngine} from '../../api/completionEngines';
import {defaultCompletionParams} from '../completionSettingsVersions';
import {
  CompletionParams,
  normaliseTimings,
  toApiCompletionParams,
} from '../completionTypes';
import {SAMPLER_PARAMS} from '../samplerParams';

describe('normaliseTimings', () => {
  it('keeps every field of a verbatim finish-chunk timings object', () => {
    expect(normaliseTimings(cacheReuseTimings)).toEqual(cacheReuseTimings);
  });

  it('drops non-number and non-finite fields, keeping the rest', () => {
    const result = normaliseTimings({
      ...cacheReuseTimings,
      prompt_per_second: 'NaN',
      predicted_per_second: null,
      cache_n: '15',
      predicted_n: NaN,
    });

    expect(result).toEqual({
      prompt_n: cacheReuseTimings.prompt_n,
      prompt_ms: cacheReuseTimings.prompt_ms,
      prompt_per_token_ms: cacheReuseTimings.prompt_per_token_ms,
      predicted_ms: cacheReuseTimings.predicted_ms,
      predicted_per_token_ms: cacheReuseTimings.predicted_per_token_ms,
    });
  });

  it('keeps a zero, which is a measurement rather than a missing value', () => {
    expect(normaliseTimings({cache_n: 0})).toEqual({cache_n: 0});
  });

  it('ignores keys outside the type', () => {
    expect(normaliseTimings({cache_n: 3, tokens_cached: 99})).toEqual({
      cache_n: 3,
    });
  });

  it('returns undefined when no field survives', () => {
    expect(normaliseTimings({})).toBeUndefined();
    expect(normaliseTimings({cache_n: Infinity})).toBeUndefined();
  });

  it('returns undefined for a value that is not an object', () => {
    expect(normaliseTimings(undefined)).toBeUndefined();
    expect(normaliseTimings(null)).toBeUndefined();
    expect(normaliseTimings('timings')).toBeUndefined();
  });
});

describe('toApiCompletionParams', () => {
  const APP_ONLY = ['version', 'include_thinking_in_context'];
  const imageMessage = {
    role: 'user',
    content: [
      {type: 'text', text: 'what is this?'},
      {
        type: 'image_url',
        image_url: {
          url: 'file:///path/to/tmp/A1B2C3D4-E5F6-4789-ABCD-EF0123456789.jpg',
        },
      },
    ],
  };

  it.each(
    Object.keys(defaultCompletionParams).filter(k => !APP_ONLY.includes(k)),
  )('keeps the setting %s unchanged', key => {
    const value = (defaultCompletionParams as Record<string, unknown>)[key];
    expect(toApiCompletionParams({[key]: value} as CompletionParams)).toEqual({
      [key]: value,
    });
  });

  it.each([...SAMPLER_PARAMS])('keeps the sampler %s', key => {
    expect(toApiCompletionParams({[key]: 1} as CompletionParams)).toEqual({
      [key]: 1,
    });
  });

  it('keeps the messages, tools and reasoning a run adds', () => {
    const run = {
      messages: [imageMessage],
      tools: [{type: 'function', function: {name: 'calculate'}}],
      reasoning: {enabled: true, effort: 'low'},
    };
    expect(
      toApiCompletionParams({...defaultCompletionParams, ...run} as any),
    ).toMatchObject(run);
  });

  it.each(APP_ONLY)('strips the app-only key %s', key => {
    expect(
      toApiCompletionParams({...defaultCompletionParams}),
    ).not.toHaveProperty(key);
  });

  it.each([
    ['media_paths', ['/data/user/0/com.pocketpalai/files/pocketpalai.db']],
    ['unknown_key', 1],
    ['n_threads', 4],
  ])('strips %s', (key, value) => {
    const result = toApiCompletionParams({
      ...defaultCompletionParams,
      [key]: value,
    } as CompletionParams);
    expect(result).not.toHaveProperty(key);
    expect(result.temperature).toBe(defaultCompletionParams.temperature);
  });

  it('sends an image message to llama.rn and nothing from stored settings', async () => {
    const context = new (LlamaContext as any)(mockLlamaContextParams);
    context.completion.mockResolvedValue({text: '', timings: {}});
    const params = toApiCompletionParams({
      ...defaultCompletionParams,
      media_paths: ['/data/user/0/com.pocketpalai/files/pocketpalai.db'],
      messages: [imageMessage],
    } as CompletionParams);

    await new LocalCompletionEngine(context).completion(params);

    const sent = context.completion.mock.calls[0][0];
    expect(sent.messages).toEqual([imageMessage]);
    expect(sent).not.toHaveProperty('media_paths');
  });
});
