import {fetchWithTimeout} from '../network';

describe('model source network helpers', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('aborts fetch requests after the timeout', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(Object.assign(new Error('aborted'), {name: 'AbortError'}));
          });
        }) as Promise<Response>,
    );

    const request = fetchWithTimeout('https://example.com/model', {}, 100);
    const timeoutExpectation = expect(request).rejects.toThrow(
      'Network timeout: request exceeded 100ms',
    );

    await jest.advanceTimersByTimeAsync(100);

    await timeoutExpectation;
  });
});
