import {cacheReuseTimings} from '../../../jest/fixtures/llamaServerTimings';
import {normaliseTimings} from '../completionTypes';

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
