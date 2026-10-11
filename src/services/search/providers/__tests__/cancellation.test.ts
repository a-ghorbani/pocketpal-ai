import {abortableFetch} from '../../../../../jest/abortableFetch';

import {readWithDefaultReader} from '../..';
import {BraveProvider} from '../brave';
import {ExaProvider} from '../exa';
import {ParallelProvider} from '../parallel';
import {TavilyProvider} from '../tavily';

type NetworkCall = (signal?: AbortSignal) => Promise<unknown>;

const opts = {maxResults: 3};
const key = () => 'key';

const calls: Array<[string, NetworkCall]> = [
  ['Tavily search', s => new TavilyProvider(key).search('q', opts, s)],
  ['Brave search', s => new BraveProvider(key).search('q', opts, s)],
  ['Exa search', s => new ExaProvider(key).search('q', opts, s)],
  ['Exa read', s => new ExaProvider(key).read('https://example.com', s)],
  ['Parallel search', s => new ParallelProvider(key).search('q', opts, s)],
  ['default reader', s => readWithDefaultReader('https://example.com', s)],
];

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
    global.fetch = abortableFetch({body: '{"results":[]}'});

    await expect(run()).resolves.toBeDefined();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
