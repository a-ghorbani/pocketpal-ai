import {GenerationSlot} from '../generationLease';
import type {CompletionEngine} from '../../utils/completionTypes';

const engineA = {name: 'A'} as unknown as CompletionEngine;
const engineB = {name: 'B'} as unknown as CompletionEngine;

const immediately = () => Promise.resolve();

const flush = async () => {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
  }
};

describe('GenerationSlot', () => {
  it('grants a lease bound to the engine current at grant time', async () => {
    const slot = new GenerationSlot();
    let current: CompletionEngine | null = engineA;
    const gate = Promise.resolve().then(() => {
      current = engineB;
    });

    const lease = await slot.acquire(
      () => gate,
      () => current,
    );

    expect(lease?.engine).toBe(engineB);
    expect(lease?.signal.aborted).toBe(false);
    expect(slot.isBusy).toBe(true);
  });

  it('resolves null when no engine can be granted, and frees the turn', async () => {
    const slot = new GenerationSlot();

    expect(await slot.acquire(immediately, () => null)).toBeNull();
    expect(slot.isBusy).toBe(false);
    expect(await slot.acquire(immediately, () => engineA)).not.toBeNull();
  });

  it('serves waiting acquirers in arrival order, each after the previous end', async () => {
    const slot = new GenerationSlot();
    const order: string[] = [];
    const first = await slot.acquire(immediately, () => engineA);

    const second = slot
      .acquire(immediately, () => engineA)
      .then(lease => {
        order.push('second');
        return lease;
      });
    const third = slot
      .acquire(immediately, () => engineA)
      .then(lease => {
        order.push('third');
        return lease;
      });
    await flush();
    expect(order).toEqual([]);

    first!.end();
    const secondLease = await second;
    await flush();
    expect(order).toEqual(['second']);

    secondLease!.end();
    await third;
    expect(order).toEqual(['second', 'third']);
  });

  it('awaits beforeGrant only after the previous lease has ended', async () => {
    const slot = new GenerationSlot();
    const first = await slot.acquire(immediately, () => engineA);
    const beforeGrant = jest.fn(immediately);

    const waiting = slot.acquire(beforeGrant, () => engineA);
    await flush();
    expect(beforeGrant).not.toHaveBeenCalled();

    first!.end();
    await waiting;
    expect(beforeGrant).toHaveBeenCalledTimes(1);
  });

  it('tryAcquire returns null while a lease is held or an acquirer waits', async () => {
    const slot = new GenerationSlot();
    const held = slot.tryAcquire(() => engineA);
    expect(held).not.toBeNull();
    expect(slot.tryAcquire(() => engineA)).toBeNull();

    const waiting = slot.acquire(immediately, () => engineA);
    held!.end();
    expect(slot.tryAcquire(() => engineA)).toBeNull();

    (await waiting)!.end();
    expect(slot.tryAcquire(() => engineA)).not.toBeNull();
  });

  it('a lease granted by tryAcquire makes the next acquire wait for its end', async () => {
    const slot = new GenerationSlot();
    const held = slot.tryAcquire(() => engineA);
    let granted = false;
    const waiting = slot
      .acquire(immediately, () => engineA)
      .then(lease => {
        granted = true;
        return lease;
      });
    await flush();
    expect(granted).toBe(false);

    held!.end();
    await waiting;
    expect(granted).toBe(true);
  });

  it('a stale end() cannot end a newer lease', async () => {
    const slot = new GenerationSlot();
    const first = await slot.acquire(immediately, () => engineA);
    first!.end();
    const second = await slot.acquire(immediately, () => engineA);

    first!.end();

    expect(slot.isBusy).toBe(true);
    expect(slot.tryAcquire(() => engineA)).toBeNull();
    second!.end();
    expect(slot.isBusy).toBe(false);
  });

  it('abortActive aborts the held lease and resolves at its end', async () => {
    const slot = new GenerationSlot();
    const lease = await slot.acquire(immediately, () => engineA);
    let drained = false;

    const drain = slot.abortActive().then(() => {
      drained = true;
    });
    expect(lease!.signal.aborted).toBe(true);
    await flush();
    expect(drained).toBe(false);

    lease!.end();
    await drain;
    expect(drained).toBe(true);
  });

  it('abortActive resolves at once when no lease is held', async () => {
    await expect(new GenerationSlot().abortActive()).resolves.toBeUndefined();
  });

  it('abort() and end() are idempotent', async () => {
    const slot = new GenerationSlot();
    const lease = await slot.acquire(immediately, () => engineA);

    lease!.abort();
    lease!.abort();
    lease!.end();
    lease!.end();

    expect(lease!.signal.aborted).toBe(true);
    expect(slot.isBusy).toBe(false);
  });
});
