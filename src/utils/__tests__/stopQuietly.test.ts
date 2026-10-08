import {stopQuietly} from '../stopQuietly';

describe('stopQuietly', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  const flush = () => new Promise(resolve => setImmediate(resolve));

  it('calls the stop once', () => {
    const stop = jest.fn().mockResolvedValue(undefined);
    stopQuietly(stop);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('logs a synchronous throw instead of throwing', () => {
    const error = new Error('Context not found');
    expect(() =>
      stopQuietly(() => {
        throw error;
      }),
    ).not.toThrow();
    expect(warn).toHaveBeenCalledWith('[stop] failed:', error);
  });

  it('accepts a stop that returns undefined', async () => {
    expect(() => stopQuietly(() => undefined)).not.toThrow();
    await flush();
    expect(warn).not.toHaveBeenCalled();
  });

  it('logs a rejection', async () => {
    const error = new Error('stop failed');
    stopQuietly(() => Promise.reject(error));
    await flush();
    expect(warn).toHaveBeenCalledWith('[stop] failed:', error);
  });
});
