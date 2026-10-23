import {autorun, reaction, runInAction} from 'mobx';

import {purchaseStore} from '../../../store';
import {
  dismissPlus,
  isPlusAvailable,
  isPlusUnlocked,
  openPlus,
  plusGate,
  shouldReturnFocusOnClose,
} from '../gate';
import {setShipOverride, shipOverride} from '../shipOverride';

jest.mock('../catalog', () =>
  require('../../../../jest/fixtures/plus').mockUnshippedCatalog(),
);

const setUnlocked = (unlocked: boolean) =>
  runInAction(() => {
    purchaseStore.plusUnlocked = unlocked;
  });

describe('Plus gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setShipOverride([]);
    setUnlocked(false);
    runInAction(() => {
      plusGate.request = null;
    });
  });

  afterEach(() => {
    (global as any).__E2E__ = true;
  });

  describe('with no shipped feature', () => {
    it('is unavailable and openPlus does nothing', () => {
      const onUnlocked = jest.fn();

      openPlus({onUnlocked});

      expect(isPlusAvailable()).toBe(false);
      expect(plusGate.request).toBeNull();
      expect(purchaseStore.retryPlusProducts).not.toHaveBeenCalled();
      dismissPlus();
      expect(onUnlocked).not.toHaveBeenCalled();
    });

    it('stays unavailable for an owner', () => {
      setUnlocked(true);
      const onUnlocked = jest.fn();

      openPlus({onUnlocked});

      expect(plusGate.request).toBeNull();
      expect(onUnlocked).not.toHaveBeenCalled();
    });
  });

  describe('with one shipped feature', () => {
    beforeEach(() => {
      setShipOverride(['handsFreeVoice']);
    });

    it('is available and openPlus shows the screen', () => {
      openPlus();

      expect(isPlusAvailable()).toBe(true);
      expect(plusGate.request).toEqual({onUnlocked: undefined});
    });

    it('retries the Plus products once per open, not while shown', () => {
      openPlus();
      openPlus({onUnlocked: jest.fn()});
      expect(purchaseStore.retryPlusProducts).toHaveBeenCalledTimes(1);

      dismissPlus();
      openPlus();
      expect(purchaseStore.retryPlusProducts).toHaveBeenCalledTimes(2);
    });

    it('starts loading in the same action that shows the screen', () => {
      (purchaseStore.retryPlusProducts as jest.Mock).mockImplementationOnce(
        () => {
          purchaseStore.plusProductsLoading = true;
        },
      );
      const seen: [boolean, boolean][] = [];
      const stop = reaction(
        () =>
          [plusGate.request !== null, purchaseStore.plusProductsLoading] as [
            boolean,
            boolean,
          ],
        value => seen.push(value),
      );

      openPlus();
      stop();

      expect(seen).toEqual([[true, true]]);
      runInAction(() => {
        purchaseStore.plusProductsLoading = false;
      });
    });

    it('replaces the callback on a second open', () => {
      const first = jest.fn();
      const second = jest.fn();
      setUnlocked(true);

      openPlus({onUnlocked: first});
      openPlus({onUnlocked: second});
      dismissPlus();

      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(1);
    });

    it('clears the request before running the callback', () => {
      setUnlocked(true);
      const reopen = jest.fn(() => {
        expect(plusGate.request).toBeNull();
        openPlus();
      });

      openPlus({onUnlocked: reopen});
      dismissPlus();

      expect(reopen).toHaveBeenCalledTimes(1);
      expect(plusGate.request).not.toBeNull();
    });

    it.each([
      [false, false, true],
      [false, true, true],
      [true, false, true],
      [true, true, false],
    ])(
      'returns focus on close unless the callback runs (unlocked %s, callback %s)',
      (unlocked, withCallback, expected) => {
        setUnlocked(unlocked);
        openPlus({onUnlocked: withCallback ? jest.fn() : undefined});

        dismissPlus();

        expect(shouldReturnFocusOnClose()).toBe(expected);
      },
    );

    it('runs the callback only when unlocked', () => {
      const onUnlocked = jest.fn();

      openPlus({onUnlocked});
      dismissPlus();

      expect(plusGate.request).toBeNull();
      expect(onUnlocked).not.toHaveBeenCalled();
    });
  });

  it('reacts to the shipped override', () => {
    const seen: boolean[] = [];
    const stop = autorun(() => {
      seen.push(isPlusAvailable());
    });

    setShipOverride(['localApiServer']);
    setShipOverride([]);
    stop();

    expect(seen).toEqual([false, true, false]);
  });

  it('ignores the override outside e2e builds', () => {
    (global as any).__E2E__ = false;

    setShipOverride(['handsFreeVoice']);

    expect(shipOverride.get().size).toBe(0);
    expect(isPlusAvailable()).toBe(false);
  });

  it('reads the unlock reactively', () => {
    const seen: boolean[] = [];
    const stop = autorun(() => {
      seen.push(isPlusUnlocked());
    });

    setUnlocked(true);
    setUnlocked(false);
    stop();

    expect(seen).toEqual([false, true, false]);
  });
});
