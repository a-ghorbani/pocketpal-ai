import {defaultCompletionParams} from '../../../utils/completionSettingsVersions';
import {SAMPLER_PARAMS, pickSamplers} from '../../../utils/samplerParams';
import type {SamplerParam} from '../../../utils/samplerParams';
import {serverDefaultState, stepOf} from '../serverDefaultState';
import type {RowState} from '../serverDefaultState';

const NONE: RowState = {kind: 'none'};
const WIRE_TEMPERATURE = 0.800000011920929;

type Case = [string, SamplerParam, number, number | undefined, RowState];

const conditional: Case[] = [
  ['omitted, default known', 'top_k', 40, 20, {kind: 'omitted', shown: 20}],
  ['omitted, default known', 'mirostat', 0, 1, {kind: 'omitted', shown: 1}],
  [
    'omitted, default out of range',
    'top_k',
    40,
    0,
    {kind: 'omitted', shown: 0},
  ],
  [
    'omitted, default out of range',
    'penalty_last_n',
    64,
    -1,
    {kind: 'omitted', shown: -1},
  ],
  [
    'omitted, default out of range',
    'mirostat',
    0,
    5,
    {kind: 'omitted', shown: 5},
  ],
  ['omitted, default not reported', 'top_k', 40, undefined, {kind: 'omitted'}],
  [
    'omitted, default not reported',
    'mirostat',
    0,
    undefined,
    {kind: 'omitted'},
  ],
  ['moved onto the default', 'top_k', 20, 20, {kind: 'matches'}],
  ['moved onto the default', 'mirostat', 2, 2, {kind: 'matches'}],
  [
    'moved off the default',
    'top_k',
    30,
    20,
    {kind: 'reset', shown: 20, resetTo: 40},
  ],
  [
    'moved off the default',
    'mirostat',
    2,
    1,
    {kind: 'reset', shown: 1, resetTo: 0},
  ],
  [
    'moved off a default out of range',
    'top_k',
    30,
    0,
    {kind: 'reset', shown: 0, resetTo: 40},
  ],
  ['moved, default not reported', 'top_k', 30, undefined, NONE],
  ['moved, default not reported', 'mirostat', 1, undefined, NONE],
];

const sentRegardless: Case[] = [
  ['on the default', 'temperature', 0.8, WIRE_TEMPERATURE, {kind: 'matches'}],
  ['on the default', 'n_predict', 512, 512, {kind: 'matches'}],
  [
    'off the default',
    'temperature',
    0.7,
    WIRE_TEMPERATURE,
    {kind: 'reset', shown: 0.8, resetTo: 0.8},
  ],
  [
    'off the default',
    'n_predict',
    512,
    -1,
    {kind: 'reset', shown: -1, resetTo: -1},
  ],
  ['off a default out of range', 'temperature', 0.7, 2.5, NONE],
  ['off a default out of range', 'top_p', 0.95, 1.5, NONE],
  ['off a default out of range', 'n_predict', 512, -2, NONE],
  ['default not reported', 'temperature', 0.7, undefined, NONE],
  ['default not reported', 'n_predict', 512, undefined, NONE],
];

const atControlPrecisionBoundaries: Case[] = [
  ['rounds up onto the slider', 'temperature', 0.13, 0.125, {kind: 'matches'}],
  ['rounds up onto the slider', 'min_p', 0.07, 0.065, {kind: 'matches'}],
  [
    'rounds up past the slider',
    'typical_p',
    0.05,
    0.055,
    {kind: 'reset', shown: 0.06, resetTo: 1},
  ],
  [
    'rounds up while left to the server',
    'min_p',
    0.05,
    0.055,
    {kind: 'omitted', shown: 0.06},
  ],
];

const nonFinite: Case[] = [
  ['an unparseable value', 'top_k', Number('abc'), 20, NONE],
  ['an unparseable value', 'temperature', Number('abc'), 0.8, NONE],
];

describe('serverDefaultState', () => {
  describe.each([
    ['a conditional sampler', conditional],
    ['a sampler sent regardless', sentRegardless],
    ['control precision', atControlPrecisionBoundaries],
    ['a non-finite value', nonFinite],
  ])('%s', (_group, cases) => {
    it.each(cases)(
      '%s: %s at %p against %p',
      (_label, name, current, serverValue, expected) => {
        expect(serverDefaultState(name, current, serverValue)).toEqual(
          expected,
        );
      },
    );
  });

  it('never writes the wire float back', () => {
    const state = serverDefaultState('temperature', 0.7, WIRE_TEMPERATURE);
    expect(state.kind === 'reset' && state.resetTo).toBe(0.8);
  });

  const parity = SAMPLER_PARAMS.flatMap(param => {
    const appDefault = Number(defaultCompletionParams[param]);
    return [
      [param, appDefault],
      [param, appDefault + stepOf(param)],
    ] as const;
  });

  it.each(parity)(
    'says %s at %p is left to the server exactly when it is not sent',
    (param, value) => {
      const omitted = serverDefaultState(param, value, undefined).kind;
      const sent = pickSamplers({...defaultCompletionParams, [param]: value});
      expect(omitted === 'omitted').toBe(!(param in sent));
    },
  );
});
