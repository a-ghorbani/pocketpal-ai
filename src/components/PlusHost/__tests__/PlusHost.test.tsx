import React from 'react';
import {BackHandler, StyleSheet} from 'react-native';
import {runInAction} from 'mobx';

import {act, fireEvent, render} from '../../../../jest/test-utils';
import {themeFixtures} from '../../../../jest/fixtures/theme';
import {mockPurchaseStore as purchaseStore} from '../../../../__mocks__/stores/purchaseStore';
import {deviceRam, ensureRamRead} from '../../../services/plus/deviceRam';
import {openPlus, plusGate} from '../../../services/plus/gate';
import {setShipOverride} from '../../../services/plus/shipOverride';
import {bannerStyles, overlayStyles} from '../../DownloadOverlay/styles';

import {PlusA11yScope} from '../PlusA11yScope';
import {PlusHost} from '../PlusHost';

jest.mock('../../../services/plus/deviceRam', () => ({
  ...jest.requireActual('../../../services/plus/deviceRam'),
  ensureRamRead: jest.fn(() => Promise.resolve()),
}));

type Handler = () => boolean | null | undefined;
let backHandlers: Handler[] = [];

const pressBack = (): boolean => {
  for (const handler of [...backHandlers].reverse()) {
    if (handler()) {
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

    fireEvent.press(getByTestId('plus-cta'));
    fireEvent.press(getByTestId('plus-close'));
    await act(async () => settle('purchased'));

    expect(purchaseStore.buyPlus).toHaveBeenCalledWith('plus.1');
    expect(queryByTestId('plus-host')).toBeNull();
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
