import React from 'react';
import {
  AccessibilityInfo,
  BackHandler,
  type HostInstance,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import {runInAction} from 'mobx';

import {act, cleanup, fireEvent, render} from '../../../../jest/test-utils';
import {themeFixtures} from '../../../../jest/fixtures/theme';
import {mockPurchaseStore as purchaseStore} from '../../../../__mocks__/stores/purchaseStore';
import {deviceRam, ensureRamRead} from '../../../services/plus/deviceRam';
import {dismissPlus, openPlus, plusGate} from '../../../services/plus/gate';
import {setShipOverride} from '../../../services/plus/shipOverride';
import {bannerStyles, overlayStyles} from '../../DownloadOverlay/styles';
import {
  claimPlusReturnFocus,
  plusReturnFocusTarget,
  releasePlusReturnFocus,
} from '../../HeaderLeft/plusReturnFocus';

import {PlusA11yScope} from '../PlusA11yScope';
import {PlusHost} from '../PlusHost';

jest.mock('../../../services/plus/deviceRam', () => ({
  ...jest.requireActual('../../../services/plus/deviceRam'),
  ensureRamRead: jest.fn(() => Promise.resolve()),
}));

type Handler = Parameters<typeof BackHandler.addEventListener>[1];
let backHandlers: Handler[] = [];

const pressBack = (): boolean => {
  for (const handler of [...backHandlers].reverse()) {
    if (handler({type: 'hardwareBackPress', timeStamp: 0})) {
      return true;
    }
  }
  return false;
};

const renderHost = () => render(<PlusHost />, {withSafeArea: true});

describe('PlusHost', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    purchaseStore.reset();
    runInAction(() => {
      purchaseStore.availability = 'ready';
      purchaseStore.plusChecked = true;
      purchaseStore.products.set('plus.1', {
        productId: 'plus.1',
        displayPrice: '$4.99',
      });
      plusGate.request = null;
      deviceRam.ramBytes = 8e9;
    });
    setShipOverride(['handsFreeVoice']);
    backHandlers = [];
    jest
      .spyOn(BackHandler, 'addEventListener')
      .mockImplementation((_event, handler) => {
        backHandlers.push(handler);
        return {
          remove: () => {
            backHandlers = backHandlers.filter(h => h !== handler);
          },
        };
      });
  });

  afterEach(() => {
    cleanup();
    setShipOverride([]);
  });

  it('renders nothing and owns no back handler while hidden', () => {
    const {queryByTestId} = renderHost();

    expect(queryByTestId('plus-host')).toBeNull();
    expect(BackHandler.addEventListener).not.toHaveBeenCalled();
  });

  it('shows the Plus screen when opened and loads what it needs', () => {
    const {getByTestId} = renderHost();

    act(() => openPlus());

    expect(getByTestId('plus-screen')).toBeTruthy();
    expect(purchaseStore.syncProducts).not.toHaveBeenCalled();
    expect(ensureRamRead).toHaveBeenCalledTimes(1);
  });

  it('closes without running the callback while locked', () => {
    const onUnlocked = jest.fn();
    const {getByTestId, queryByTestId} = renderHost();
    act(() => openPlus({onUnlocked}));

    fireEvent.press(getByTestId('plus-close'));

    expect(queryByTestId('plus-host')).toBeNull();
    expect(plusGate.request).toBeNull();
    expect(onUnlocked).not.toHaveBeenCalled();
  });

  it('runs the callback once after Done, with the host already gone', () => {
    let requestWhenCalled: unknown = 'unset';
    const onUnlocked = jest.fn(() => {
      requestWhenCalled = plusGate.request;
    });
    const {getByTestId, queryByTestId} = renderHost();
    act(() => openPlus({onUnlocked}));
    act(() =>
      runInAction(() => {
        purchaseStore.plusUnlocked = true;
      }),
    );

    fireEvent.press(getByTestId('plus-done'));

    expect(onUnlocked).toHaveBeenCalledTimes(1);
    expect(requestWhenCalled).toBeNull();
    expect(queryByTestId('plus-host')).toBeNull();
  });

  it('takes Android back ahead of a handler registered earlier', () => {
    const navigationBack = jest.fn(() => true);
    BackHandler.addEventListener('hardwareBackPress', navigationBack);
    const {queryByTestId} = renderHost();
    act(() => openPlus());

    let handled = false;
    act(() => {
      handled = pressBack();
    });

    expect(handled).toBe(true);
    expect(navigationBack).not.toHaveBeenCalled();
    expect(queryByTestId('plus-host')).toBeNull();
    expect(backHandlers).toEqual([navigationBack]);
  });

  it('stacks above every global host', () => {
    const {getByTestId} = renderHost();
    act(() => openPlus());
    const root = StyleSheet.flatten(getByTestId('plus-host').props.style);
    const theme = themeFixtures.lightTheme;

    expect(root.zIndex).toBeGreaterThan(overlayStyles(theme, 0).root.zIndex);
    expect(root.elevation).toBeGreaterThan(bannerStyles(theme).root.elevation);
    expect(root).toMatchObject({position: 'absolute', top: 0, bottom: 0});
  });

  it('keeps screen readers inside the host on iOS', () => {
    const {getByTestId} = renderHost();
    act(() => openPlus());

    expect(getByTestId('plus-host').props.accessibilityViewIsModal).toBe(true);
  });

  it('lets a purchase in flight finish after the host closes', async () => {
    let settle!: (result: string) => void;
    purchaseStore.buyPlus.mockReturnValue(
      new Promise(resolve => {
        settle = resolve;
      }),
    );
    const {getByTestId, queryByTestId} = renderHost();
    act(() => openPlus());

    fireEvent.press(getByTestId('plus-tile-plus.1'));
    fireEvent.press(getByTestId('plus-cta'));
    fireEvent.press(getByTestId('plus-close'));
    await act(async () => settle('purchased'));

    expect(purchaseStore.buyPlus).toHaveBeenCalledWith('plus.1');
    expect(queryByTestId('plus-host')).toBeNull();
  });
});

describe.each([
  ['iOS', 'ios', 'focus'],
  ['Android', 'android', 'viewHoverEnter'],
])('PlusHost screen-reader focus on %s', (_platform, os, event) => {
  interface FocusCall {
    target: string;
    event: string;
    hostGone: boolean;
    scope: string;
  }
  let calls: FocusCall[];
  let screen: ReturnType<typeof render>;
  const slotView = React.createRef<HostInstance>();

  const renderApp = () => {
    screen = render(
      <>
        <PlusA11yScope>
          <View ref={slotView} />
        </PlusA11yScope>
        <PlusHost />
      </>,
      {withSafeArea: true},
    );
    return screen;
  };

  const originalOS = Platform.OS;

  const nextFrame = () =>
    act(() => {
      jest.runOnlyPendingTimers();
    });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    (Platform as any).OS = os;
    purchaseStore.reset();
    runInAction(() => {
      purchaseStore.availability = 'ready';
      purchaseStore.plusChecked = true;
      purchaseStore.products.set('plus.1', {
        productId: 'plus.1',
        displayPrice: '$4.99',
      });
      plusGate.request = null;
      deviceRam.ramBytes = 8e9;
    });
    setShipOverride(['handsFreeVoice']);
    backHandlers = [];
    jest
      .spyOn(BackHandler, 'addEventListener')
      .mockImplementation((_event, handler) => {
        backHandlers.push(handler);
        return {
          remove: () => {
            backHandlers = backHandlers.filter(h => h !== handler);
          },
        };
      });
    calls = [];
    jest
      .spyOn(AccessibilityInfo, 'sendAccessibilityEvent')
      .mockImplementation((node, eventType) => {
        calls.push({
          target:
            node === slotView.current
              ? 'slot'
              : (node as any).props?.accessibilityRole === 'header'
                ? `header:${(node as any).props.children}`
                : 'other',
          event: eventType,
          hostGone: screen.queryByTestId('plus-host') === null,
          scope: screen.getByTestId('plus-a11y-scope', {
            includeHiddenElements: true,
          }).props.importantForAccessibility,
        });
      });
  });

  afterEach(() => {
    cleanup();
    releasePlusReturnFocus(plusReturnFocusTarget());
    setShipOverride([]);
    (Platform as any).OS = originalOS;
    jest.useRealTimers();
  });

  const openWithSlot = () => {
    renderApp();
    claimPlusReturnFocus(slotView.current);
    act(() => openPlus());
    nextFrame();
  };

  it('moves focus to the headline on the frame after Plus opens', () => {
    renderApp();
    act(() => openPlus());
    expect(calls).toEqual([]);

    nextFrame();

    expect(calls.map(({target, event: sent}) => [target, sent])).toEqual([
      ['header:Push local AI further.', event],
    ]);
  });

  it.each([
    ['Close', () => fireEvent.press(screen.getByTestId('plus-close'))],
    [
      'back',
      () =>
        act(() => {
          pressBack();
        }),
    ],
    [
      'the escape gesture',
      () => fireEvent(screen.getByTestId('plus-host'), 'accessibilityEscape'),
    ],
  ])(
    'returns focus to the hamburger after %s, once the host is gone',
    (_label, close) => {
      openWithSlot();

      close();
      nextFrame();

      expect(plusGate.request).toBeNull();
      expect(calls).toHaveLength(2);
      expect(calls[1]).toEqual({
        target: 'slot',
        event,
        hostGone: true,
        scope: 'auto',
      });
    },
  );

  it('drops the headline focus when Plus closes before the next frame', () => {
    renderApp();
    claimPlusReturnFocus(slotView.current);
    act(() => openPlus());

    fireEvent.press(screen.getByTestId('plus-close'));
    nextFrame();

    expect(calls.map(call => call.target)).toEqual(['slot']);
  });

  it('leaves focus to the feature after onUnlocked runs', () => {
    renderApp();
    claimPlusReturnFocus(slotView.current);
    const onUnlocked = jest.fn();
    act(() => openPlus({onUnlocked}));
    nextFrame();
    act(() =>
      runInAction(() => {
        purchaseStore.plusUnlocked = true;
      }),
    );

    fireEvent.press(screen.getByTestId('plus-done'));
    nextFrame();

    expect(onUnlocked).toHaveBeenCalledTimes(1);
    expect(calls.map(call => call.target)).toEqual([
      'header:Push local AI further.',
    ]);
  });

  const setUnlocked = (plusUnlocked: boolean) =>
    act(() =>
      runInAction(() => {
        purchaseStore.plusUnlocked = plusUnlocked;
      }),
    );
  const targets = () => calls.map(call => call.target);

  it('moves focus to the thank-you headline on the frame after Plus unlocks', () => {
    renderApp();
    act(() => openPlus());
    nextFrame();

    setUnlocked(true);
    expect(calls).toHaveLength(1);

    nextFrame();
    expect(calls.map(({target, event: sent}) => [target, sent])).toEqual([
      ['header:Push local AI further.', event],
      ['header:Thank you for keeping PocketPal going.', event],
    ]);
  });

  it('drops the unlock focus when Plus closes before the next frame', () => {
    openWithSlot();

    setUnlocked(true);
    fireEvent.press(screen.getByTestId('plus-done'));
    nextFrame();

    expect(targets()).toEqual(['header:Push local AI further.', 'slot']);
  });

  it('focuses the thank-you headline once when opened already unlocked', () => {
    renderApp();
    setUnlocked(true);

    act(() => openPlus());
    nextFrame();

    expect(targets()).toEqual([
      'header:Thank you for keeping PocketPal going.',
    ]);
  });

  it('makes no call when Plus is relocked while shown', () => {
    renderApp();
    setUnlocked(true);
    act(() => openPlus());
    nextFrame();

    setUnlocked(false);
    nextFrame();

    expect(calls).toHaveLength(1);
  });

  it('makes one call when Plus opens and unlocks in the same commit', () => {
    renderApp();

    act(() =>
      runInAction(() => {
        openPlus();
        purchaseStore.plusUnlocked = true;
      }),
    );
    nextFrame();

    expect(targets()).toEqual([
      'header:Thank you for keeping PocketPal going.',
    ]);
  });

  it('makes no close call when no hamburger holds the slot', () => {
    renderApp();
    act(() => openPlus());
    nextFrame();

    fireEvent.press(screen.getByTestId('plus-close'));
    nextFrame();

    expect(calls.map(call => call.target)).toEqual([
      'header:Push local AI further.',
    ]);
  });

  it('makes no call on a first mount while hidden', () => {
    const slot = (
      <PlusA11yScope>
        <View ref={slotView} />
      </PlusA11yScope>
    );
    screen = render(slot, {withSafeArea: true});
    claimPlusReturnFocus(slotView.current);
    act(() => {
      openPlus();
      dismissPlus();
    });

    screen.rerender(
      <>
        {slot}
        <PlusHost />
      </>,
    );
    nextFrame();

    expect(plusReturnFocusTarget() === slotView.current).toBe(true);
    expect(calls).toEqual([]);
  });
});

describe('PlusA11yScope', () => {
  beforeEach(() => {
    runInAction(() => {
      plusGate.request = null;
    });
  });

  it('hides the app beneath from Android screen readers while Plus is shown', () => {
    const {getByTestId} = render(
      <PlusA11yScope>
        <></>
      </PlusA11yScope>,
    );
    const scope = () =>
      getByTestId('plus-a11y-scope', {includeHiddenElements: true});

    expect(scope().props.importantForAccessibility).toBe('auto');
    expect(scope().props.collapsable).toBe(false);

    act(() =>
      runInAction(() => {
        plusGate.request = {};
      }),
    );
    expect(scope().props.importantForAccessibility).toBe('no-hide-descendants');

    act(() =>
      runInAction(() => {
        plusGate.request = null;
      }),
    );
    expect(scope().props.importantForAccessibility).toBe('auto');
  });
});
