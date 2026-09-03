import {probePairingTarget, probeServerReachability} from '../openai';
import {
  authErrorBody,
  constructedEmptyModelsBody,
  healthOkBody,
} from '../../../jest/fixtures/pairingWire';
import {
  directTextModelsBody,
  routerModelsBody,
} from '../../../jest/fixtures/remoteModelList';

const BASE = 'http://192.168.1.5:9931';

type StubResponse = {
  status: number;
  headers?: Record<string, string>;
  json?: () => Promise<any>;
  text?: () => Promise<string>;
};

const respond = ({status, headers = {}, json, text}: StubResponse) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: {
    forEach: (fn: (value: string, key: string) => void) =>
      Object.entries(headers).forEach(([k, v]) => fn(v, k)),
  },
  json: json ?? (async () => ({})),
  text: text ?? (async () => ''),
});

/** Routes each stub by url substring so a test states only what it cares about. */
const routeFetch = (routes: Array<[RegExp, StubResponse | 'reject']>) =>
  jest.fn(async (url: string) => {
    for (const [pattern, result] of routes) {
      if (pattern.test(url)) {
        if (result === 'reject') {
          throw new Error('Network request failed');
        }
        return respond(result);
      }
    }
    throw new Error(`unstubbed request: ${url}`);
  });

const LLAMA_HEADERS = {server: 'llama.cpp'};
const listOk = (body: any = directTextModelsBody): StubResponse => ({
  status: 200,
  headers: LLAMA_HEADERS,
  json: async () => body,
});

const propsUrls = (fetchMock: jest.Mock): string[] =>
  fetchMock.mock.calls
    .map(c => c[0] as string)
    .filter(u => u.includes('/props'));

afterEach(() => {
  jest.restoreAllMocks();
});

describe('probeServerReachability', () => {
  it('reads /health on llama.cpp and /v1/models elsewhere', async () => {
    const fetchMock = routeFetch([
      [/./, {status: 200, json: async () => healthOkBody}],
    ]);
    global.fetch = fetchMock as any;

    await probeServerReachability(BASE, {serverType: 'llama.cpp'});
    await probeServerReachability(BASE, {serverType: 'Ollama'});

    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/health`);
    expect(fetchMock.mock.calls[1][0]).toBe(`${BASE}/v1/models`);
  });

  it('calls any HTTP response reachable, a 401 included', async () => {
    global.fetch = routeFetch([[/./, {status: 401}]]) as any;
    await expect(probeServerReachability(BASE)).resolves.toBe('reachable');
  });

  it('calls only a transport failure unreachable', async () => {
    global.fetch = routeFetch([[/./, 'reject']]) as any;
    await expect(probeServerReachability(BASE)).resolves.toBe('unreachable');
  });
});

describe('probePairingTarget — step 1 verdicts', () => {
  it('is unreachable when the list request never answers', async () => {
    global.fetch = routeFetch([[/./, 'reject']]) as any;
    await expect(probePairingTarget(BASE)).resolves.toEqual({
      outcome: 'unreachable',
    });
  });

  it('is unauthorized{source:list} on a 401 from the list, issuing no gate', async () => {
    const fetchMock = routeFetch([
      [/\/v1\/models/, {status: 401, json: async () => authErrorBody}],
    ]);
    global.fetch = fetchMock as any;

    await expect(probePairingTarget(BASE, {apiKey: 'k'})).resolves.toEqual({
      outcome: 'unauthorized',
      status: 401,
      source: 'list',
    });
    expect(propsUrls(fetchMock)).toHaveLength(0);
  });

  it('is server-error on any other non-2xx, and points at the address', async () => {
    global.fetch = routeFetch([[/\/v1\/models/, {status: 502}]]) as any;
    await expect(probePairingTarget(BASE)).resolves.toEqual({
      outcome: 'server-error',
      status: 502,
    });
  });

  it('is unreadable on a 200 whose body is not JSON — a captive portal', async () => {
    global.fetch = routeFetch([
      [
        /\/v1\/models/,
        {
          status: 200,
          json: async () => {
            throw new SyntaxError('Unexpected token < in JSON');
          },
        },
      ],
    ]) as any;

    await expect(probePairingTarget(BASE)).resolves.toEqual({
      outcome: 'unreadable',
      status: 200,
    });
  });

  it('is unreadable on a 200 that parses without an array data', async () => {
    global.fetch = routeFetch([
      [/\/v1\/models/, {status: 200, json: async () => ({ok: true})}],
    ]) as any;

    await expect(probePairingTarget(BASE)).resolves.toEqual({
      outcome: 'unreadable',
      status: 200,
    });
  });

  it('keeps an empty list usable, distinguishable from unreadable', async () => {
    // constructedEmptyModelsBody is CONSTRUCTED, not captured: no measured
    // server emits zero rows. Only the array-ness of `data` is asserted.
    expect(Array.isArray(constructedEmptyModelsBody.data)).toBe(true);

    global.fetch = routeFetch([
      [/\/v1\/models/, listOk(constructedEmptyModelsBody)],
      [/\/props/, {status: 200}],
    ]) as any;

    const result = await probePairingTarget(BASE);
    expect(result).toMatchObject({outcome: 'usable', models: []});
  });
});

describe('probePairingTarget — the gate and its keyless control', () => {
  it('is unauthorized{source:gate} when the gate refuses, though the list answered 200', async () => {
    const fetchMock = routeFetch([
      [/\/v1\/models/, listOk(routerModelsBody)],
      [/\/props/, {status: 401, json: async () => authErrorBody}],
    ]);
    global.fetch = fetchMock as any;

    await expect(probePairingTarget(BASE, {apiKey: 'wrong'})).resolves.toEqual({
      outcome: 'unauthorized',
      status: 401,
      source: 'gate',
    });
  });

  it('is authorised only when the keyless control is refused outright', async () => {
    let call = 0;
    global.fetch = jest.fn(async (url: string) => {
      if (url.includes('/v1/models')) {
        return respond(listOk());
      }
      call += 1;
      return respond({status: call === 1 ? 200 : 401});
    }) as any;

    await expect(
      probePairingTarget(BASE, {apiKey: 'k'}),
    ).resolves.toMatchObject({outcome: 'usable', authorisation: 'authorised'});
  });

  it.each([
    ['a 200 — the server does not gate /props at all', {status: 200}],
    ['a 404 — a fact about the build', {status: 404}],
    ['a 500 — a fact about that moment', {status: 500}],
    [
      'a transport failure or timeout, which is a non-answer',
      'reject' as const,
    ],
  ])(
    'leaves authorisation unconfirmed when the control answers %s',
    async (_label, controlResult) => {
      let call = 0;
      global.fetch = jest.fn(async (url: string) => {
        if (url.includes('/v1/models')) {
          return respond(listOk());
        }
        call += 1;
        if (call === 1) {
          return respond({status: 200});
        }
        if (controlResult === 'reject') {
          throw new Error('Network request failed');
        }
        return respond(controlResult);
      }) as any;

      await expect(
        probePairingTarget(BASE, {apiKey: 'k'}),
      ).resolves.toMatchObject({
        outcome: 'usable',
        authorisation: 'unconfirmed',
      });
    },
  );

  it('issues no control when no key is held, and stays unconfirmed', async () => {
    const fetchMock = routeFetch([
      [/\/v1\/models/, listOk()],
      [/\/props/, {status: 200}],
    ]);
    global.fetch = fetchMock as any;

    await expect(probePairingTarget(BASE)).resolves.toMatchObject({
      outcome: 'usable',
      authorisation: 'unconfirmed',
    });
    expect(propsUrls(fetchMock)).toHaveLength(1);
  });

  it('issues no gate for a detected type whose gating this lane has not measured', async () => {
    const fetchMock = routeFetch([
      [
        /\/v1\/models/,
        {
          status: 200,
          json: async () => ({
            data: [{id: 'm', object: 'model', owned_by: 'organization_owner'}],
          }),
        },
      ],
    ]);
    global.fetch = fetchMock as any;

    await expect(
      probePairingTarget(BASE, {apiKey: 'k'}),
    ).resolves.toMatchObject({
      outcome: 'usable',
      serverType: 'LM Studio',
      authorisation: 'unconfirmed',
    });
    expect(propsUrls(fetchMock)).toHaveLength(0);
  });

  it('issues exactly two bare, status-only /props requests and reads no body', async () => {
    const propsJson = jest.fn(async () => authErrorBody);
    let call = 0;
    const fetchMock = jest.fn(async (url: string) => {
      if (url.includes('/v1/models')) {
        return respond(listOk());
      }
      call += 1;
      return {...respond({status: call === 1 ? 200 : 401}), json: propsJson};
    });
    global.fetch = fetchMock as any;

    await probePairingTarget(BASE, {apiKey: 'k'});

    const urls = propsUrls(fetchMock);
    expect(urls).toEqual([`${BASE}/props`, `${BASE}/props`]);
    expect(urls.every(u => !u.includes('?model='))).toBe(true);
    expect(propsJson).not.toHaveBeenCalled();
  });

  it('attaches the key to the gate and omits it from the control', async () => {
    let call = 0;
    const fetchMock = jest.fn(async (url: string) => {
      if (url.includes('/v1/models')) {
        return respond(listOk());
      }
      call += 1;
      return respond({status: call === 1 ? 200 : 401});
    });
    global.fetch = fetchMock as any;

    await probePairingTarget(BASE, {apiKey: 'sk-x'});

    const propsCalls = (fetchMock.mock.calls as any[][]).filter(c =>
      (c[0] as string).includes('/props'),
    );
    expect(propsCalls[0][1].headers.Authorization).toBe('Bearer sk-x');
    expect(propsCalls[1][1].headers.Authorization).toBeUndefined();
  });
});
