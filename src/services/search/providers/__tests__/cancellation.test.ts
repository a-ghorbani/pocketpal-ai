import {abortableFetch, okResponse} from '../../../../../jest/abortableFetch';

import {createSearchProvider, readWithDefaultReader} from '../..';
import {SEARCH_PROVIDERS} from '../../../../store/SearchProviderStore';

type NetworkCall = (signal?: AbortSignal) => Promise<unknown>;

const opts = {maxResults: 3};
const key = () => 'key';
const pageUrl = 'https://example.com';

const providers = SEARCH_PROVIDERS.map(
  ({id, label}) => [label, createSearchProvider(id, key)] as const,
);

const searches: Array<[string, NetworkCall]> = providers.map(
  ([label, provider]) => [
    `${label} search`,
    s => provider.search('q', opts, s),
  ],
);

const reads: Array<[string, NetworkCall]> = [
  ...providers.flatMap(([label, provider]): Array<[string, NetworkCall]> => {
    const read = provider.read?.bind(provider);
    return read ? [[`${label} read`, s => read(pageUrl, s)]] : [];
  }),
  ['default reader', s => readWithDefaultReader(pageUrl, s)],
];

const calls = [...searches, ...reads];

describe('search network calls honour the caller signal', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each(calls)(
    '%s aborts its request and rejects "cancelled"',
    async (_label, run) => {
      const caller = new AbortController();
      let fetchSignal: AbortSignal | undefined;
      global.fetch = abortableFetch({
        onCall: ({signal}) => {
          fetchSignal = signal;
          caller.abort();
        },
      });

      await expect(run(caller.signal)).rejects.toThrow('cancelled');
      expect(fetchSignal?.aborted).toBe(true);
      expect(jest.getTimerCount()).toBe(0);
    },
  );

  it.each(calls)('%s resolves as before without a signal', async (_l, run) => {
    global.fetch = abortableFetch({
      body: '{"type":"search","results":[],"success":true,"data":{}}',
    });

    await expect(run()).resolves.toBeDefined();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('search network calls on a 429', () => {
  const rateLimited = {
    ok: false,
    status: 429,
    headers: {get: () => null},
    text: () => Promise.resolve(''),
  } as unknown as Response;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each(searches)('%s retries once', async (_label, run) => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(rateLimited)
      .mockResolvedValueOnce(
        okResponse('{"type":"search","results":[],"success":true,"data":{}}'),
      );

    const result = run();
    await jest.advanceTimersByTimeAsync(1000);

    await expect(result).resolves.toBeDefined();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it.each(reads)('%s is not retried', async (_label, run) => {
    global.fetch = jest.fn().mockResolvedValue(rateLimited);

    const result = run().then(
      () => 'resolved',
      (e: Error) => e.message,
    );
    await jest.advanceTimersByTimeAsync(5000);

    expect(await result).toBe('request failed (429)');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
