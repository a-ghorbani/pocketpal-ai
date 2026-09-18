import {defaultCompletionParams} from '../completionSettingsVersions';
import type {CompletionParams} from '../completionTypes';
import {pickSamplers} from '../samplerParams';

// Settings reach here straight off a persisted record, so the shapes below are
// what the store can actually hold rather than what the type admits.
const stored = (values: Record<string, unknown>) =>
  values as unknown as CompletionParams;

describe('pickSamplers', () => {
  it('keeps only finite numbers, zero included', () => {
    expect(
      pickSamplers(
        stored({
          temperature: NaN,
          top_p: Infinity,
          min_p: -Infinity,
          typical_p: null,
          penalty_repeat: '1.2',
          top_k: 10,
          penalty_last_n: 0,
        }),
      ),
    ).toEqual({top_k: 10, penalty_last_n: 0});
  });

  it('carries no key the sampler vocabulary does not name', () => {
    expect(
      Object.keys(pickSamplers(stored({temperature: 0.7, n_ctx: 4096}))),
    ).toEqual(['temperature']);
  });

  it('sends nothing for a control still on the app default', () => {
    expect(pickSamplers(defaultCompletionParams)).toEqual({
      temperature: defaultCompletionParams.temperature,
      top_p: defaultCompletionParams.top_p,
      n_predict: defaultCompletionParams.n_predict,
    });
  });

  it('sends a control the user moved off the app default', () => {
    expect(
      pickSamplers(
        stored({
          top_k: defaultCompletionParams.top_k! + 1,
          mirostat: 1,
          seed: 12345,
        }),
      ),
    ).toEqual({
      top_k: defaultCompletionParams.top_k! + 1,
      mirostat: 1,
      seed: 12345,
    });
  });
});
