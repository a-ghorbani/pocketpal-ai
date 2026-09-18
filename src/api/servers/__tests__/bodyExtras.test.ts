/**
 * The table itself: what a server profile puts in the body, per server type,
 * for a given set of samplers and a given reasoning intent. Pure — no engine,
 * no transport. The wire names are the part a server answers with a 200 and
 * silently ignores when they are wrong, so they are read back off a captured
 * `/slots` rather than restated here. That a turn carries this answer onto the
 * request it posts is the engine's business, tested in `api/__tests__`.
 */
import type {ReasoningIntent} from '../../../utils/completionTypes';
import {EFFORT_LEVELS} from '../../../utils/reasoningCapability';
import type {EffortLevel} from '../../../utils/reasoningCapability';
import type {SamplerParam, Samplers} from '../../../utils/samplerParams';
import {SERVER_TYPE_OPTIONS} from '../../../utils/serverTypes';
import type {ServerType} from '../../../utils/serverTypes';
import {slotsAfterSamplerRequest} from '../../../../jest/fixtures/llamaServerWire';
import {TRANSPORT_BODY_KEYS} from '../../openai';
import {PROPS_READ_NAMES} from '../../llamaServer/props';
import {SERVER_PROFILES, bodyExtras} from '../index';
import type {ServerRequest} from '../index';

const llamaCppSendNames = SERVER_PROFILES['llama.cpp'].sendNames;

const reasoningBody = (
  serverType: string | undefined,
  reasoning?: ReasoningIntent,
) => bodyExtras(serverType, {samplers: {}, reasoning});

const samplerBody = (serverType: string | undefined, samplers: Samplers) =>
  bodyExtras(serverType, {samplers});

// ---- Reasoning ----

type Extras = Record<string, unknown>;
type Row = [string, ReasoningIntent | undefined, Extras];

const NO_INTENT: Row = ['no intent at all', undefined, {}];
const NOT_A_LEVEL = 'extreme';

/** Rising with the level, and uncapped at max. */
const LLAMA_CPP_BUDGET: Record<EffortLevel, number> = {
  minimal: 256,
  low: 512,
  medium: 2048,
  high: 8192,
  xhigh: 16384,
  max: -1,
};

/**
 * `reasoning_format: 'auto'` whatever the intent, and on/off carried solely by
 * `enable_thinking`: llama-server has no top-level `reasoning_effort`, so it
 * 200s and keeps thinking on. An effort that is not a level sends no budget,
 * leaving the server's own default in force.
 */
const llamaCppRows: Row[] = [
  NO_INTENT,
  [
    'off',
    {enabled: false},
    {
      reasoning_format: 'auto',
      chat_template_kwargs: {enable_thinking: false},
    },
  ],
  [
    'off, an effort still stored',
    {enabled: false, effort: 'high'},
    {
      reasoning_format: 'auto',
      chat_template_kwargs: {enable_thinking: false},
    },
  ],
  ['on, no effort', {enabled: true}, {reasoning_format: 'auto'}],
  ...EFFORT_LEVELS.map(
    (effort): Row => [
      `on at ${effort}`,
      {enabled: true, effort},
      {
        reasoning_format: 'auto',
        chat_template_kwargs: {reasoning_effort: effort},
        reasoning_budget_tokens: LLAMA_CPP_BUDGET[effort],
      },
    ],
  ),
  [
    'on at an effort that is not a level',
    {enabled: true, effort: NOT_A_LEVEL},
    {
      reasoning_format: 'auto',
      chat_template_kwargs: {reasoning_effort: NOT_A_LEVEL},
    },
  ],
];

/** On/off only: the LM Studio chat API ignores `reasoning_effort`. */
const lmStudioRows: Row[] = [
  NO_INTENT,
  ['off', {enabled: false}, {chat_template_kwargs: {enable_thinking: false}}],
  [
    'off, an effort still stored',
    {enabled: false, effort: 'high'},
    {chat_template_kwargs: {enable_thinking: false}},
  ],
  ['on, no effort', {enabled: true}, {}],
  ...EFFORT_LEVELS.map(
    (effort): Row => [`on at ${effort}`, {enabled: true, effort}, {}],
  ),
  [
    'on at an effort that is not a level',
    {enabled: true, effort: NOT_A_LEVEL},
    {},
  ],
];

/**
 * `reasoning_effort: 'none'` is a safe no-op for OFF. Never `think: true` and
 * never a non-`'none'` effort: both are a hard 400 on a model with no thinking
 * support, so ON sends nothing at all.
 */
const ollamaRows: Row[] = [
  NO_INTENT,
  ['off', {enabled: false}, {reasoning_effort: 'none'}],
  [
    'off, an effort still stored',
    {enabled: false, effort: 'high'},
    {reasoning_effort: 'none'},
  ],
  ['on, no effort', {enabled: true}, {}],
  ...EFFORT_LEVELS.map(
    (effort): Row => [`on at ${effort}`, {enabled: true, effort}, {}],
  ),
  [
    'on at an effort that is not a level',
    {enabled: true, effort: NOT_A_LEVEL},
    {},
  ],
];

/**
 * The stored effort alone decides: a reasoning parameter on a model that has
 * none is a 400, so on/off without an effort sends nothing, and an effort is
 * forwarded even when the toggle reads off.
 */
const openaiRows: Row[] = [
  NO_INTENT,
  ['off', {enabled: false}, {}],
  [
    'off, an effort still stored',
    {enabled: false, effort: 'high'},
    {reasoning_effort: 'high'},
  ],
  ['on, no effort', {enabled: true}, {}],
  ...EFFORT_LEVELS.map(
    (effort): Row => [
      `on at ${effort}`,
      {enabled: true, effort},
      {reasoning_effort: effort},
    ],
  ),
  [
    'on at an effort that is not a level',
    {enabled: true, effort: NOT_A_LEVEL},
    {reasoning_effort: NOT_A_LEVEL},
  ],
];

/** Modern vLLM ignores an unknown `chat_template_kwargs` entry, so both are safe. */
const vllmRows: Row[] = [
  NO_INTENT,
  ['off', {enabled: false}, {chat_template_kwargs: {enable_thinking: false}}],
  [
    'off, an effort still stored',
    {enabled: false, effort: 'high'},
    {chat_template_kwargs: {enable_thinking: false}},
  ],
  ['on, no effort', {enabled: true}, {}],
  ...EFFORT_LEVELS.map(
    (effort): Row => [
      `on at ${effort}`,
      {enabled: true, effort},
      {chat_template_kwargs: {reasoning_effort: effort}},
    ],
  ),
  [
    'on at an effort that is not a level',
    {enabled: true, effort: NOT_A_LEVEL},
    {chat_template_kwargs: {reasoning_effort: NOT_A_LEVEL}},
  ],
];

/** Nothing, whatever the intent: the base speaks no reasoning at all. */
const silentRows: Row[] = [
  NO_INTENT,
  ['off', {enabled: false}, {}],
  ['off, an effort still stored', {enabled: false, effort: 'high'}, {}],
  ['on, no effort', {enabled: true}, {}],
  ...EFFORT_LEVELS.map(
    (effort): Row => [`on at ${effort}`, {enabled: true, effort}, {}],
  ),
  [
    'on at an effort that is not a level',
    {enabled: true, effort: NOT_A_LEVEL},
    {},
  ],
];

const REASONING_ROWS: Record<ServerType, Row[]> = {
  'llama.cpp': llamaCppRows,
  'LM Studio': lmStudioRows,
  Ollama: ollamaRows,
  OpenAI: openaiRows,
  vLLM: vllmRows,
  unknown: silentRows,
};

// Every type in the union, so a type added to the UI without a row here fails
// rather than going unchecked. What a persisted value outside the union
// resolves to is `profileFor`'s, tested with it.
describe.each(SERVER_TYPE_OPTIONS)('the %s reasoning body', serverType => {
  it.each(REASONING_ROWS[serverType])(
    'sends %s',
    (_label, reasoning, expected) => {
      expect(reasoningBody(serverType, reasoning)).toEqual(expected);
    },
  );
});

it('sends a budget to llama.cpp alone', () => {
  for (const serverType of SERVER_TYPE_OPTIONS) {
    const body = reasoningBody(serverType, {enabled: true, effort: 'high'});
    expect(body.reasoning_budget_tokens !== undefined).toBe(
      serverType === 'llama.cpp',
    );
  }
});

// ---- Samplers ----

describe('bodyExtras (sampler forwarding)', () => {
  // The read-back of a request carrying the `settings` below, so the slot
  // holds both the server's own vocabulary and the values it accepted under
  // it. Projected from the live body rather than restated here: a name spelled
  // the same way in the parser and in a hand-written fixture would agree with
  // itself and with nothing else. Slot 0 holds the server's defaults, which
  // would prove the names and none of the values.
  const appSlot = slotsAfterSamplerRequest[3];
  const serverParams = appSlot.params as unknown as Record<string, number>;
  const serverSamplerNames = Object.keys(serverParams);

  const settings = {
    temperature: 0.33,
    top_p: 0.77,
    top_k: 11,
    min_p: 0.11,
    typical_p: 0.91,
    xtc_threshold: 0.31,
    xtc_probability: 0.21,
    penalty_last_n: 41,
    penalty_repeat: 1.11,
    penalty_freq: 0.41,
    penalty_present: 0.51,
    mirostat: 2,
    mirostat_tau: 4.1,
    mirostat_eta: 0.21,
    seed: 12345,
    n_predict: 128,
    n_probs: 3,
  };

  const BASE_KEYS = {
    temperature: 0.33,
    top_p: 0.77,
    max_completion_tokens: 128,
  };

  // Send name to the name `/slots` reports it back under. The two differ for
  // exactly one param, and the props read map is where that asymmetry is
  // already declared, so the check derives from it instead of naming the pair
  // again: a param whose send name the server does not know fails here even
  // though nobody added a case for it.
  const readNameOf = Object.fromEntries(
    Object.entries(llamaCppSendNames).map(([param, wireName]) => [
      wireName,
      PROPS_READ_NAMES[param as SamplerParam],
    ]),
  );

  it('spells every emitted sampler the way the server does', () => {
    const payload = samplerBody('llama.cpp', settings);

    // Every send name is exercised, so a param added to the map without a
    // value here fails rather than going unchecked.
    expect(Object.keys(payload).sort()).toEqual(
      Object.values(llamaCppSendNames).sort(),
    );
    for (const name of Object.keys(payload)) {
      expect(serverSamplerNames).toContain(readNameOf[name]);
    }
  });

  it('lands each value under the name the server reports it back under', () => {
    const payload = samplerBody('llama.cpp', settings);
    // The captured request set its own length and pre-dates n_probs
    // forwarding, so those two values cannot be read back from it.
    const notCaptured = ['n_predict', 'n_probs'];

    for (const [param, wireName] of Object.entries(llamaCppSendNames)) {
      if (notCaptured.includes(param)) {
        continue;
      }
      const readName = PROPS_READ_NAMES[param as SamplerParam];
      expect(serverParams[readName]).toBeCloseTo(Number(payload[wireName]), 6);
    }
  });

  it('renames the four penalties the server does not know by our names', () => {
    const ourPenaltyNames = [
      'penalty_last_n',
      'penalty_repeat',
      'penalty_freq',
      'penalty_present',
    ];
    for (const ours of ourPenaltyNames) {
      expect(serverSamplerNames).not.toContain(ours);
    }

    const payload = samplerBody('llama.cpp', settings);
    for (const ours of ourPenaltyNames) {
      expect(payload).not.toHaveProperty(ours);
    }
    expect(payload.repeat_last_n).toBe(41);
    expect(payload.repeat_penalty).toBe(1.11);
    expect(payload.frequency_penalty).toBe(0.41);
    expect(payload.presence_penalty).toBe(0.51);
  });

  it('forwards exactly its own send map and nothing else', () => {
    expect(samplerBody('llama.cpp', settings)).toEqual({
      ...BASE_KEYS,
      n_probs: 3,
      top_k: 11,
      min_p: 0.11,
      typical_p: 0.91,
      xtc_threshold: 0.31,
      xtc_probability: 0.21,
      repeat_last_n: 41,
      repeat_penalty: 1.11,
      frequency_penalty: 0.41,
      presence_penalty: 0.51,
      mirostat: 2,
      mirostat_tau: 4.1,
      mirostat_eta: 0.21,
      seed: 12345,
    });
  });

  it('omits a value that is not a finite number, and keeps a zero', () => {
    expect(
      samplerBody('llama.cpp', {
        top_k: undefined,
        min_p: NaN,
        typical_p: Infinity,
        mirostat: 0,
      }),
    ).toEqual({mirostat: 0});
  });

  it.each(['vLLM', 'Ollama', 'OpenAI', 'LM Studio', 'unknown'])(
    'sends %s only the base three, the send map it does not override',
    serverType => {
      expect(samplerBody(serverType, settings)).toEqual(BASE_KEYS);
      expect(samplerBody(serverType, {top_k: 11, mirostat: NaN})).toEqual({});
    },
  );
});

// ---- Every profile ----

/** A full request, for the checks that hold for every profile alike. */
function settingsForEveryProfile(): Samplers {
  return {
    temperature: 0.7,
    top_p: 0.9,
    top_k: 10,
    min_p: 0.05,
    typical_p: 0.95,
    xtc_threshold: 0.1,
    xtc_probability: 0.2,
    penalty_last_n: 64,
    penalty_repeat: 1.2,
    penalty_freq: 0.4,
    penalty_present: 0.5,
    mirostat: 2,
    mirostat_tau: 5,
    mirostat_eta: 0.1,
    seed: 42,
    n_predict: 1024,
    n_probs: 3,
  };
}

const REQUESTS: Array<[string, ServerRequest]> = [
  ['no samplers, no reasoning', {samplers: {}}],
  ['every sampler', {samplers: settingsForEveryProfile()}],
  [
    'every sampler with reasoning on at a level',
    {
      samplers: settingsForEveryProfile(),
      reasoning: {enabled: true, effort: 'high'},
    },
  ],
];

describe.each(SERVER_TYPE_OPTIONS)('the %s profile', type => {
  // The transport's own list, not a copy of it: a key it gains is a key this
  // check starts banning, without anyone remembering to add it here. The
  // transport writes its keys last, so a profile naming one loses silently
  // instead of breaking a request — which is why the ban is checked here and
  // not on the wire.
  it.each(REQUESTS)('returns no transport-owned key for %s', (_name, req) => {
    for (const key of Object.keys(bodyExtras(type, req))) {
      expect(TRANSPORT_BODY_KEYS).not.toContain(key);
    }
  });

  it.each(REQUESTS)('assembles the same body twice for %s', (_name, req) => {
    const unchanged = JSON.stringify(req);

    expect(bodyExtras(type, req)).toEqual(bodyExtras(type, req));
    expect(JSON.stringify(req)).toBe(unchanged);
  });
});
