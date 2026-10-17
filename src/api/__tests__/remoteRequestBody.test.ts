/**
 * The body a remote turn actually puts on the wire, through the engine that
 * builds it. What each server type's body should say is the profile table's,
 * pinned in `api/servers`; what this adds is that a turn carries the table's
 * answer onto the request, adds nothing of its own, leaves the transport's own
 * keys standing, and forwards only the samplers the user moved off the app
 * default.
 */
import {OpenAICompletionEngine} from '../completionEngines';
import {TRANSPORT_BODY_KEYS} from '../openai';
import {bodyExtras} from '../servers';
import type {ApiCompletionParams} from '../../utils/completionTypes';
import type {CompletionParams} from '../../utils/completionTypes';
import type {ReasoningIntent} from '../../utils/completionTypes';
import {defaultCompletionParams} from '../../utils/completionSettingsVersions';
import {pickSamplers} from '../../utils/samplerParams';
import {SERVER_TYPE_OPTIONS} from '../../utils/serverTypes';
import type {ServerType} from '../../utils/serverTypes';

class FakeXHR {
  static last: FakeXHR;
  body = '';
  readyState = 0;
  status = 0;
  statusText = '';
  responseText = '';
  onreadystatechange: (() => void) | null = null;
  onprogress: (() => void) | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  constructor() {
    FakeXHR.last = this;
  }
  open() {}
  setRequestHeader() {}
  send(body?: string) {
    this.body = body ?? '';
  }
  abort() {
    this.onabort?.();
  }
  finishTurn() {
    this.readyState = 2;
    this.status = 200;
    this.onreadystatechange?.();
    this.responseText =
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n';
    this.onprogress?.();
    this.readyState = 4;
    this.onload?.();
  }
}

let realXHR: typeof XMLHttpRequest;
beforeEach(() => {
  realXHR = global.XMLHttpRequest;
  (global as any).XMLHttpRequest = FakeXHR;
});
afterEach(() => {
  global.XMLHttpRequest = realXHR;
});

const MESSAGES = [{role: 'user', content: 'Hi'}];

/** One turn to a server of `serverType`, as the JSON it posted. */
const postedBody = async (
  serverType: string | undefined,
  params: Partial<ApiCompletionParams> & {reasoning?: ReasoningIntent},
): Promise<Record<string, unknown>> => {
  const engine = new OpenAICompletionEngine({
    url: 'http://localhost:8080',
    remoteModelId: 'm',
    serverType: serverType as ServerType,
  });
  const pending = engine.completion({
    messages: MESSAGES,
    ...params,
  } as ApiCompletionParams);
  const xhr = FakeXHR.last;
  const body = JSON.parse(xhr.body) as Record<string, unknown>;
  xhr.finishTurn();
  await pending;

  return body;
};

/** The same turn, reduced to the keys the profile put there. */
const extrasOf = async (
  serverType: string | undefined,
  params: Partial<ApiCompletionParams> & {reasoning?: ReasoningIntent},
): Promise<Record<string, unknown>> =>
  Object.fromEntries(
    Object.entries(await postedBody(serverType, params)).filter(
      ([key]) => !(TRANSPORT_BODY_KEYS as readonly string[]).includes(key),
    ),
  );

/** Every sampler, each moved off its app default so none is left to the server. */
const MOVED_SAMPLERS = {
  temperature: 0.33,
  top_p: 0.77,
  n_predict: 256,
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
  n_probs: 2,
};

const REASONING: ReasoningIntent = {enabled: true, effort: 'high'};

describe.each(SERVER_TYPE_OPTIONS)('a turn to a %s server', serverType => {
  // Against the table rather than a restatement of it: the wire names and the
  // reasoning keys are pinned where the table is, and a turn that dropped the
  // samplers, the reasoning intent or the server type shows up here as a body
  // that no longer matches the profile's answer.
  it('posts exactly what the profile puts beyond the transport keys', async () => {
    const extras = await extrasOf(serverType, {
      ...MOVED_SAMPLERS,
      reasoning: REASONING,
    });

    expect(extras).toEqual(
      bodyExtras(serverType, {samplers: MOVED_SAMPLERS, reasoning: REASONING}),
    );
    // A profile that answered with nothing would make the line above pass on
    // an empty body.
    expect(Object.keys(extras).length).toBeGreaterThan(0);
  });

  it('leaves every transport-owned key the transport wrote', async () => {
    const body = await postedBody(serverType, {
      ...MOVED_SAMPLERS,
      reasoning: REASONING,
      stop: ['</s>'],
    });

    expect(body.model).toBe('m');
    expect(body.messages).toEqual(MESSAGES);
    expect(body.stream).toBe(true);
    expect(body.stop).toEqual(['</s>']);
  });
});

describe('the samplers a turn forwards', () => {
  it('sends only the three that are always sent when every control is on its app default', async () => {
    expect(await extrasOf('llama.cpp', defaultCompletionParams)).toEqual({
      temperature: defaultCompletionParams.temperature,
      top_p: defaultCompletionParams.top_p,
      max_completion_tokens: defaultCompletionParams.n_predict,
    });
  });

  it('adds a control the user moved off the app default', async () => {
    const extras = await extrasOf('llama.cpp', {
      ...defaultCompletionParams,
      top_k: defaultCompletionParams.top_k! + 1,
    });

    expect(extras.top_k).toBe(defaultCompletionParams.top_k! + 1);
    expect(Object.keys(extras).sort()).toEqual([
      'max_completion_tokens',
      'temperature',
      'top_k',
      'top_p',
    ]);
  });

  it('omits a sampler that is absent rather than sending a default of its own', async () => {
    expect(await extrasOf('llama.cpp', {})).toEqual({});
  });

  it('leaves the moved samplers whole, so the bodies above are not the filter at work', () => {
    expect(pickSamplers(MOVED_SAMPLERS as unknown as CompletionParams)).toEqual(
      MOVED_SAMPLERS,
    );
  });
});
