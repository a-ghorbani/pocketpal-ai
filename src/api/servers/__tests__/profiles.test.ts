import {profileFor, readFinish, SERVER_PROFILES} from '../index';
import {streamFinishChunk} from '../../../../jest/fixtures/llamaServerWire';

describe('profileFor', () => {
  it.each(['', undefined, 'Llama.CPP', 'my server'])(
    'resolves the persisted value %p to the base',
    raw => {
      expect(profileFor(raw)).toBe(SERVER_PROFILES.unknown);
    },
  );

  it('resolves a stored value of the wrong kind to the base', () => {
    // A hydrated record is not type-checked, so the cast is the storage layer,
    // not the test taking a liberty.
    expect(profileFor(42 as unknown as string)).toBe(SERVER_PROFILES.unknown);
  });

  it('resolves a known type to its own profile', () => {
    expect(profileFor('llama.cpp')).toBe(SERVER_PROFILES['llama.cpp']);
  });
});

describe('readFinish', () => {
  it.each([undefined, null, 42, 'nope', {}, {timings: 'none'}])(
    'reads %p as no finish facts',
    chunk => {
      expect(readFinish(chunk)).toEqual({});
    },
  );

  it('sums the evaluated and cached prompt tokens off a verbatim chunk', () => {
    expect(readFinish(streamFinishChunk)).toEqual({
      timings: streamFinishChunk.timings,
      tokensEvaluated: 16,
      tokensPredicted: 6,
    });
  });
});
