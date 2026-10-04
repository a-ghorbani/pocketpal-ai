import {stopUntilSettled} from '../stopUntilSettled';

function deferred() {
  let resolve!: () => void;
  let reject!: (err: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, resolve, reject};
}

describe('stopUntilSettled', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('never stops when the signal is not aborted', async () => {
    const pending = deferred();
    const stop = jest.fn();
    const done = stopUntilSettled(
      pending.promise,
      new AbortController().signal,
      stop,
    );

    jest.advanceTimersByTime(1000);
    pending.resolve();
    await done;

    expect(stop).not.toHaveBeenCalled();
  });

  it('stops at once on abort and repeats every interval while pending', async () => {
    const pending = deferred();
    const controller = new AbortController();
    const stop = jest.fn();
    const done = stopUntilSettled(pending.promise, controller.signal, stop);

    controller.abort();
    expect(stop).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(350);
    expect(stop).toHaveBeenCalledTimes(4);

    pending.resolve();
    await done;
    jest.advanceTimersByTime(1000);
    expect(stop).toHaveBeenCalledTimes(4);
  });

  it('stops at once when the signal was already aborted', async () => {
    const pending = deferred();
    const controller = new AbortController();
    controller.abort();
    const stop = jest.fn();
    const done = stopUntilSettled(pending.promise, controller.signal, stop);

    expect(stop).toHaveBeenCalledTimes(1);
    pending.resolve();
    await done;
  });

  it('never stops once the pending call has settled', async () => {
    const pending = deferred();
    const controller = new AbortController();
    const stop = jest.fn();
    const done = stopUntilSettled(pending.promise, controller.signal, stop);

    pending.resolve();
    await done;
    controller.abort();
    jest.advanceTimersByTime(1000);

    expect(stop).not.toHaveBeenCalled();
  });

  it('resolves when the pending call rejects, and survives a failing stop', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const pending = deferred();
    const controller = new AbortController();
    const stop = jest.fn(async () => {
      throw new Error('native gone');
    });
    const done = stopUntilSettled(pending.promise, controller.signal, stop);

    controller.abort();
    jest.advanceTimersByTime(100);
    pending.reject(new Error('completion failed'));

    await expect(done).resolves.toBeUndefined();
    expect(stop).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
