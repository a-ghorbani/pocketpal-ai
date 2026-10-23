import React from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Linking,
  Platform,
  StyleSheet,
} from 'react-native';
import {runInAction} from 'mobx';
import type {
  ReactTestInstance,
  ReactTestRendererJSON,
} from 'react-test-renderer';

import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from '../../../../jest/test-utils';
import {mockPurchaseStore as purchaseStore} from '../../../../__mocks__/stores/purchaseStore';
import {fakePlusFeatures, fakePlusL10n} from '../../../../jest/fixtures/plus';
import {themeFixtures} from '../../../../jest/fixtures/theme';
import {L10nContext} from '../../../utils';
import type {PlusFeature} from '../../../services/plus/catalog';
import {deviceRam} from '../../../services/plus/deviceRam';
import {modelStore, voiceModeStore} from '../../../store';
import {setShipOverride} from '../../../services/plus/shipOverride';

import {
  APPLE_EULA_URL,
  APPLE_MEDIA_TERMS_URL,
  REPO_URL,
} from '../../../config/urls';

import {PlusScreen} from '../PlusScreen';

jest.mock(
  '../../../assets/icons',
  () =>
    new Proxy(
      {__esModule: true},
      {
        get: (target: Record<string, unknown>, prop: string) =>
          prop in target ? target[prop] : String(prop),
      },
    ),
);

const mockWindow = {width: 411, height: 923, scale: 2, fontScale: 1};

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockWindow,
}));

let mockFeatures: PlusFeature[] | undefined;

jest.mock('../../../services/plus/catalog', () => {
  const actual = jest.requireActual('../../../services/plus/catalog');
  const mocked = {...actual};
  Object.defineProperty(mocked, 'PLUS_FEATURES', {
    get: () => mockFeatures ?? actual.PLUS_FEATURES,
  });
  return mocked;
});

const PRICES: Record<string, string> = {
  'plus.1': '$4.99',
  'plus.2': '$9.99',
  'plus.3': '$24.99',
  'plus.4': '$49.99',
};

const setProducts = (ids: string[]) =>
  runInAction(() => {
    purchaseStore.products.clear();
    ids.forEach(productId =>
      purchaseStore.products.set(productId, {
        productId,
        displayPrice: PRICES[productId],
      }),
    );
  });

const set = (changes: Partial<typeof purchaseStore>) =>
  runInAction(() => {
    Object.assign(purchaseStore, changes);
  });

const screenElement = (onClose: () => void) => (
  <L10nContext.Provider value={fakePlusL10n}>
    <PlusScreen onClose={onClose} />
  </L10nContext.Provider>
);

const expectLiveRegionOnlyOn = (title: ReactTestInstance) => {
  expect(title.props.accessibilityLiveRegion).toBe('polite');
  for (let node = title.parent; node; node = node.parent) {
    if (typeof node.type === 'string') {
      expect(node.props.accessibilityLiveRegion).toBeUndefined();
    }
  }
};

const renderScreen = () => {
  const onClose = jest.fn();
  const screen = render(screenElement(onClose), {withSafeArea: true});
  return {...screen, onClose};
};

describe('PlusScreen', () => {
  let openURL: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    purchaseStore.reset();
    mockFeatures = undefined;
    mockWindow.height = 923;
    set({availability: 'ready', plusChecked: true});
    setProducts(['plus.1', 'plus.2', 'plus.3', 'plus.4']);
    setShipOverride(['handsFreeVoice']);
    runInAction(() => {
      deviceRam.ramBytes = 8e9;
      modelStore.deviceTier = 'high';
    });
    openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    setShipOverride([]);
  });

  describe('idle', () => {
    it('shows the features, no tile selected and Choose an amount', () => {
      const {getByTestId, getByText, queryByTestId} = renderScreen();

      expect(getByText('Push local AI further.')).toBeTruthy();
      expect(
        getByText(
          'Plus keeps PocketPal free and open source. The extra features are our thanks.',
        ),
      ).toBeTruthy();
      expect(getByTestId('plus-feature-handsFreeVoice')).toHaveTextContent(
        'Hands-free voiceReady',
      );
      expect(getByTestId('plus-feature-localApiServer')).toHaveTextContent(
        'Local API serverComing soon',
      );
      expect(getByText('Speed depends on your phone and model.')).toBeTruthy();
      expect(getByTestId('plus-free-line')).toHaveTextContent(
        'Plus is optional. Chatting stays free.',
      );
      expect(
        getByText(
          'Pay what feels right. Every amount unlocks the same features.',
        ),
      ).toBeTruthy();
      ['plus.1', 'plus.2', 'plus.3', 'plus.4'].forEach(id =>
        expect(getByTestId(`plus-tile-${id}`).props.accessibilityState).toEqual(
          {checked: false, disabled: false},
        ),
      );
      expect(getByTestId('plus-cta')).toHaveTextContent('Choose an amount');
      expect(getByTestId('plus-cta').props.accessibilityLabel).toBe(
        'Choose an amount',
      );
      expect(getByTestId('plus-cta').props.accessibilityState).toEqual({
        busy: false,
        disabled: true,
      });
      expect(
        StyleSheet.flatten(getByTestId('plus-cta').props.style).backgroundColor,
      ).toBe(themeFixtures.lightTheme.colors.surfaceVariant);
      expect(
        StyleSheet.flatten(getByText('Choose an amount').props.style).color,
      ).toBe(themeFixtures.lightTheme.colors.onBackground);
      expect(getByText('One-time purchase')).toBeTruthy();
      expect(getByTestId('plus-restore')).toBeTruthy();
      expect(getByTestId('plus-open-source')).toBeTruthy();
      expect(queryByTestId('plus-licence')).toBeNull();
      expect(queryByTestId('plus-error-line')).toBeNull();
    });

    it('orders tiles from the catalog', () => {
      setProducts(['plus.4', 'plus.2', 'plus.1', 'plus.3']);
      const {getAllByRole} = renderScreen();

      expect(getAllByRole('radio').map(tile => tile.props.testID)).toEqual([
        'plus-tile-plus.1',
        'plus-tile-plus.2',
        'plus-tile-plus.3',
        'plus-tile-plus.4',
      ]);
    });

    it('buys nothing until a tile is picked', () => {
      const {getByTestId, getByText} = renderScreen();

      fireEvent.press(getByTestId('plus-cta'));
      expect(purchaseStore.buyPlus).not.toHaveBeenCalled();

      fireEvent.press(getByTestId('plus-tile-plus.3'));
      expect(getByTestId('plus-cta')).toHaveTextContent('Get Plus · $24.99');
      expect(getByTestId('plus-cta').props.accessibilityLabel).toBe(
        'Get Plus · $24.99',
      );
      expect(getByTestId('plus-cta').props.accessibilityState).toEqual({
        busy: false,
        disabled: false,
      });
      expect(
        StyleSheet.flatten(getByTestId('plus-cta').props.style).backgroundColor,
      ).not.toBe(themeFixtures.lightTheme.colors.surfaceVariant);
      expect(
        StyleSheet.flatten(getByText('Get Plus · $24.99').props.style).color,
      ).toBe(themeFixtures.lightTheme.colors.background);
    });

    it('checks only the last picked tile', () => {
      const {getByTestId} = renderScreen();

      fireEvent.press(getByTestId('plus-tile-plus.3'));
      fireEvent.press(getByTestId('plus-tile-plus.2'));

      expect(
        ['plus.1', 'plus.2', 'plus.3', 'plus.4'].map(
          id => getByTestId(`plus-tile-${id}`).props.accessibilityState.checked,
        ),
      ).toEqual([false, true, false, false]);
      expect(getByTestId('plus-cta')).toHaveTextContent('Get Plus · $9.99');
    });

    it('forgets the pick when the screen opens again', () => {
      const {getByTestId, queryByTestId, rerender, onClose} = renderScreen();
      fireEvent.press(getByTestId('plus-tile-plus.2'));
      expect(getByTestId('plus-cta')).toHaveTextContent('Get Plus · $9.99');

      rerender(<></>);
      expect(queryByTestId('plus-cta')).toBeNull();
      rerender(screenElement(onClose));

      expect(getByTestId('plus-cta')).toHaveTextContent('Choose an amount');
      expect(
        getByTestId('plus-tile-plus.2').props.accessibilityState.checked,
      ).toBe(false);
    });

    it('falls back to Choose an amount when the picked price goes away', () => {
      const {getByTestId} = renderScreen();
      fireEvent.press(getByTestId('plus-tile-plus.4'));

      act(() => setProducts(['plus.1', 'plus.2', 'plus.3']));

      expect(getByTestId('plus-cta')).toHaveTextContent('Choose an amount');
      expect(getByTestId('plus-cta').props.accessibilityState).toMatchObject({
        disabled: true,
      });
      fireEvent.press(getByTestId('plus-cta'));
      expect(purchaseStore.buyPlus).not.toHaveBeenCalled();
    });

    it('buys the selected price', async () => {
      const {getByTestId} = renderScreen();

      fireEvent.press(getByTestId('plus-tile-plus.3'));
      expect(getByTestId('plus-cta')).toHaveTextContent('Get Plus · $24.99');
      fireEvent.press(getByTestId('plus-cta'));

      await waitFor(() =>
        expect(purchaseStore.buyPlus).toHaveBeenCalledWith('plus.3'),
      );
    });
  });

  it('shows a spinner and locks the tiles while paying', () => {
    set({plusFlow: 'paying'});
    const {getByTestId} = renderScreen();

    expect(getByTestId('plus-cta')).not.toHaveTextContent('Choose an amount');
    expect(getByTestId('plus-cta').props.accessibilityLabel).toBe('Loading');
    expect(getByTestId('plus-cta').props.accessibilityState).toMatchObject({
      busy: true,
      disabled: true,
    });
    expect(getByTestId('plus-tile-plus.2').props.accessibilityState).toEqual({
      checked: false,
      disabled: true,
    });
  });

  it('shows the pending notice with a disabled button and no prices', () => {
    set({plusPending: true});
    const {getByTestId, queryByTestId} = renderScreen();

    expect(getByTestId('plus-pending-notice')).toHaveTextContent(
      'Waiting for the store to confirm your payment.',
    );
    expect(getByTestId('plus-cta')).toHaveTextContent('Pending');
    expect(getByTestId('plus-cta').props.accessibilityLabel).toBe('Pending');
    expect(getByTestId('plus-cta').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    expect(queryByTestId('plus-tile-plus.1')).toBeNull();
    expectLiveRegionOnlyOn(getByTestId('plus-pending-notice'));
  });

  it('returns quietly to the same price on cancel', async () => {
    purchaseStore.buyPlus.mockResolvedValue('cancelled');
    const {getByTestId, queryByTestId} = renderScreen();

    fireEvent.press(getByTestId('plus-tile-plus.2'));
    fireEvent.press(getByTestId('plus-cta'));
    await act(async () => {});

    expect(queryByTestId('plus-error-line')).toBeNull();
    expect(getByTestId('plus-cta')).toHaveTextContent('Get Plus · $9.99');
  });

  it('shows an inline error and lets the user try again', async () => {
    purchaseStore.buyPlus.mockResolvedValueOnce('error');
    const {getByTestId, queryByTestId, queryByText} = renderScreen();

    fireEvent.press(getByTestId('plus-tile-plus.1'));
    await act(async () => {
      fireEvent.press(getByTestId('plus-cta'));
    });

    expect(getByTestId('plus-error-line')).toHaveTextContent(
      "The purchase didn't go through. Try again.",
    );
    expect(
      queryByText(
        'Pay what feels right. Every amount unlocks the same features.',
      ),
    ).toBeNull();
    expect(getByTestId('plus-free-line')).toBeTruthy();
    expect(getByTestId('plus-tile-plus.1').props.accessibilityState).toEqual({
      checked: true,
      disabled: false,
    });

    purchaseStore.buyPlus.mockResolvedValueOnce('cancelled');
    await act(async () => {
      fireEvent.press(getByTestId('plus-cta'));
    });
    expect(queryByTestId('plus-error-line')).toBeNull();
    expect(purchaseStore.buyPlus).toHaveBeenCalledTimes(2);
  });

  it('thanks the owner and offers only Done', () => {
    set({plusUnlocked: true});
    const {getByTestId, getByText, queryByTestId, onClose, UNSAFE_root} =
      renderScreen();

    expect(getByText('Thank you for keeping PocketPal going.')).toBeTruthy();
    expect(getByText('Plus is unlocked on this device.')).toBeTruthy();
    const hearts = UNSAFE_root.findAll(
      node => (node.type as string) === 'HeartIcon',
    );
    expect(hearts).toHaveLength(1);
    expect(hearts[0].props.stroke).toBe(
      themeFixtures.lightTheme.colors.secondary,
    );
    expect(getByTestId('plus-feature-handsFreeVoice')).toBeTruthy();
    expect(queryByTestId('plus-tile-plus.1')).toBeNull();
    expect(queryByTestId('plus-restore')).toBeNull();
    expect(queryByTestId('plus-cta')).toBeNull();
    expect(queryByTestId('plus-free-line')).toBeNull();
    expect(getByTestId('plus-done').props.accessibilityLabel).toBe('Done');

    fireEvent.press(getByTestId('plus-done'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps one button while paying and mounts a new one when pending', () => {
    const {getByTestId} = renderScreen();
    fireEvent.press(getByTestId('plus-tile-plus.1'));
    const buy = getByTestId('plus-cta');

    act(() => set({plusFlow: 'paying'}));
    expect(getByTestId('plus-cta')).toBe(buy);
    expect(buy.props.accessibilityLabel).toBe('Loading');

    act(() => set({plusFlow: 'idle', plusPending: true}));
    expect(getByTestId('plus-cta')).not.toBe(buy);
  });

  it('mounts a new button when Plus unlocks', () => {
    const {getByTestId} = renderScreen();
    const buy = getByTestId('plus-cta');

    act(() => set({plusUnlocked: true}));

    expect(getByTestId('plus-done')).not.toBe(buy);
  });

  it('closes from any state', () => {
    set({plusPending: true});
    const {getByTestId, onClose} = renderScreen();

    fireEvent.press(getByTestId('plus-close'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe('feature rows', () => {
    it('below its device gate, shows hands-free voice as Off with the Settings note under its name', () => {
      runInAction(() => {
        modelStore.deviceTier = 'low';
      });
      const {getByTestId} = renderScreen();

      expect(getByTestId('plus-feature-handsFreeVoice')).toHaveTextContent(
        "Hands-free voiceOff on this phone. Turn it on in Settings if you're brave.Off",
      );
      expect(getByTestId('plus-feature-note-handsFreeVoice')).toHaveTextContent(
        "Off on this phone. Turn it on in Settings if you're brave.",
      );
      fireEvent.press(getByTestId('plus-tile-plus.1'));
      expect(getByTestId('plus-cta')).toHaveTextContent('Get Plus · $4.99');
    });

    it('below its device gate, shows hands-free voice as Ready once turned on in Settings', () => {
      runInAction(() => {
        modelStore.deviceTier = 'low';
        voiceModeStore.userVoiceModeOverride = true;
      });
      const {getByTestId, queryByTestId} = renderScreen();

      expect(getByTestId('plus-feature-handsFreeVoice')).toHaveTextContent(
        'Hands-free voiceReady',
      );
      expect(queryByTestId('plus-feature-note-handsFreeVoice')).toBeNull();
      runInAction(() => {
        voiceModeStore.userVoiceModeOverride = null;
      });
    });

    it('on a supported phone, shows hands-free voice as Off when turned off in Settings', () => {
      runInAction(() => {
        voiceModeStore.userVoiceModeOverride = false;
      });
      const {getByTestId} = renderScreen();

      expect(getByTestId('plus-feature-handsFreeVoice')).toHaveTextContent(
        'Hands-free voiceTurned off in Settings.Off',
      );
      expect(getByTestId('plus-feature-note-handsFreeVoice')).toHaveTextContent(
        'Turned off in Settings.',
      );
      fireEvent.press(getByTestId('plus-tile-plus.1'));
      expect(getByTestId('plus-cta')).toHaveTextContent('Get Plus · $4.99');
      runInAction(() => {
        voiceModeStore.userVoiceModeOverride = null;
      });
    });

    it('on a supported phone, shows hands-free voice as Ready by default', () => {
      const {getByTestId, queryByTestId} = renderScreen();

      expect(getByTestId('plus-feature-handsFreeVoice')).toHaveTextContent(
        'Hands-free voiceReady',
      );
      expect(queryByTestId('plus-feature-note-handsFreeVoice')).toBeNull();
    });

    it('shows Ready, Needs N GB and Coming soon', () => {
      mockFeatures = fakePlusFeatures([
        {id: 'open', shipped: true},
        {id: 'big', shipped: true, minRamGb: 16},
        {id: 'later', shipped: false},
      ]);
      const {getByTestId} = renderScreen();

      expect(getByTestId('plus-feature-open')).toHaveTextContent(
        'Open featureReady',
      );
      expect(getByTestId('plus-feature-big')).toHaveTextContent(
        'Big featureNeeds 16 GB RAM',
      );
      expect(getByTestId('plus-feature-later')).toHaveTextContent(
        'Later featureComing soon',
      );
    });

    it('offers Get Plus when one shipped feature runs here', () => {
      mockFeatures = fakePlusFeatures([
        {id: 'open', shipped: true},
        {id: 'later', shipped: false},
      ]);
      const {getByTestId} = renderScreen();

      fireEvent.press(getByTestId('plus-tile-plus.1'));
      expect(getByTestId('plus-cta')).toHaveTextContent('Get Plus · $4.99');
    });

    it('offers Get Plus anyway when no shipped feature runs here', () => {
      mockFeatures = fakePlusFeatures([
        {id: 'big', shipped: true, minRamGb: 16},
        {id: 'bigger', shipped: true, minRamGb: 24},
      ]);
      const {getByTestId, getByText} = renderScreen();

      expect(getByTestId('plus-cta')).toHaveTextContent('Choose an amount');
      fireEvent.press(getByTestId('plus-tile-plus.1'));
      expect(getByTestId('plus-cta')).toHaveTextContent(
        'Get Plus anyway · $4.99',
      );
      expect(
        getByText(
          "Plus features don't run on this phone yet. You can still support PocketPal.",
        ),
      ).toBeTruthy();
    });

    it('withholds RAM-gated rows for an owner until RAM is known', () => {
      mockFeatures = fakePlusFeatures([
        {id: 'big', shipped: true, minRamGb: 16},
        {id: 'open', shipped: true},
      ]);
      set({plusUnlocked: true});
      runInAction(() => {
        deviceRam.ramBytes = null;
      });
      const {queryByTestId} = renderScreen();

      expect(queryByTestId('plus-feature-big')).toBeNull();
      expect(queryByTestId('plus-feature-open')).toBeTruthy();
    });

    it('swaps the speed line for the in-development note on ⓘ', () => {
      const {getByTestId, getByText, queryByText} = renderScreen();
      const info = getByTestId('plus-info-localApiServer');

      expect(info.props.accessibilityLabel).toBe(
        'Features in development may change or not ship.',
      );
      expect(
        getByText('Speed depends on your phone and model.').props
          .accessibilityLiveRegion,
      ).toBeUndefined();
      fireEvent.press(info);

      expect(
        getByText('Features in development may change or not ship.').props
          .accessibilityLiveRegion,
      ).toBe('polite');
      expect(queryByText('Speed depends on your phone and model.')).toBeNull();

      fireEvent.press(info);
      expect(
        getByText('Speed depends on your phone and model.').props
          .accessibilityLiveRegion,
      ).toBeUndefined();
    });
  });

  describe('unavailable and loading', () => {
    it('shows the unavailable notice with Restore when billing is down', () => {
      set({availability: 'unavailable'});
      const {getByTestId, queryByTestId} = renderScreen();

      expect(getByTestId('plus-unavailable-notice')).toHaveTextContent(
        "Purchases aren't available right now.",
      );
      expect(queryByTestId('plus-cta')).toBeNull();
      expect(queryByTestId('plus-tile-plus.1')).toBeNull();
      expect(getByTestId('plus-restore')).toBeTruthy();
      expectLiveRegionOnlyOn(getByTestId('plus-unavailable-notice'));
    });

    it('shows unavailable when the store returned no Plus product', () => {
      setProducts([]);
      const {getByTestId} = renderScreen();

      expect(getByTestId('plus-unavailable-notice')).toBeTruthy();
    });

    it('shows a spinner in place of the prices while loading', () => {
      set({plusChecked: false});
      const {getByLabelText, getByTestId, queryByTestId} = renderScreen();

      expect(getByTestId('plus-loading')).toBeTruthy();
      expect(getByLabelText('Loading')).toBeTruthy();
      expect(queryByTestId('plus-unavailable-notice')).toBeNull();
      expect(queryByTestId('plus-cta')).toBeNull();
      expect(queryByTestId('plus-tile-plus.1')).toBeNull();
      expect(getByTestId('plus-restore')).toBeTruthy();
    });

    it('draws the loading slot like the paying button', () => {
      set({plusChecked: false});
      const {getByLabelText, getByTestId, UNSAFE_getByType} = renderScreen();
      const loadingFill = StyleSheet.flatten(
        getByTestId('plus-loading').props.style,
      ).backgroundColor;
      const loadingSpinner = getByLabelText('Loading').props.color;

      act(() => set({plusChecked: true, plusFlow: 'paying'}));

      expect(loadingFill).toBe(
        StyleSheet.flatten(getByTestId('plus-cta').props.style).backgroundColor,
      );
      expect(loadingSpinner).toBe(
        UNSAFE_getByType(ActivityIndicator).props.color,
      );
    });

    it('keeps the loaded prices while a missing one reloads', () => {
      setProducts(['plus.1', 'plus.2', 'plus.3']);
      set({plusProductsLoading: true});
      const {getByTestId, queryByTestId} = renderScreen();

      expect(queryByTestId('plus-loading')).toBeNull();
      expect(getByTestId('plus-tile-plus.3')).toBeTruthy();
      fireEvent.press(getByTestId('plus-tile-plus.1'));
      expect(getByTestId('plus-cta')).toHaveTextContent('Get Plus · $4.99');
    });
  });

  describe('licence line', () => {
    it('shows the licence line and drops One-time purchase', () => {
      set({showsLicenseNotice: true});
      const {getByTestId, getByText, queryByText} = renderScreen();

      expect(getByTestId('plus-licence')).toHaveTextContent(
        'One-time purchase of a licence to use Plus. Terms · Apple Media Services Terms',
      );
      expect(queryByText('One-time purchase')).toBeNull();

      fireEvent.press(getByText('Terms'));
      fireEvent.press(getByText('Apple Media Services Terms'));
      expect(openURL).toHaveBeenNthCalledWith(1, APPLE_EULA_URL);
      expect(openURL).toHaveBeenNthCalledWith(2, APPLE_MEDIA_TERMS_URL);
    });
  });

  describe('footer', () => {
    it('opens the public repository', () => {
      const {getByTestId} = renderScreen();

      fireEvent.press(getByTestId('plus-open-source'));

      expect(openURL).toHaveBeenCalledWith(REPO_URL);
      expect(REPO_URL).toBe('https://github.com/a-ghorbani/pocketpal-ai');
    });

    it('says when no Plus purchase was found', async () => {
      const {getByTestId} = renderScreen();

      fireEvent.press(getByTestId('plus-restore'));

      await waitFor(() =>
        expect(getByTestId('plus-restore-note')).toHaveTextContent(
          'No Plus purchase found.',
        ),
      );
    });

    it('says when the store could not be reached', async () => {
      purchaseStore.restore.mockResolvedValueOnce({
        queryOk: false,
      });
      const {getByTestId} = renderScreen();

      fireEvent.press(getByTestId('plus-restore'));

      await waitFor(() =>
        expect(getByTestId('plus-restore-note')).toHaveTextContent(
          "Couldn't reach the store. Try again.",
        ),
      );
    });

    it('treats a failed restore as unreachable', async () => {
      purchaseStore.restore.mockRejectedValueOnce(new Error('boom'));
      const {getByTestId} = renderScreen();

      fireEvent.press(getByTestId('plus-restore'));

      await waitFor(() =>
        expect(getByTestId('plus-restore-note')).toHaveTextContent(
          "Couldn't reach the store. Try again.",
        ),
      );
    });

    it('moves to purchased when Restore finds Plus', async () => {
      purchaseStore.restore.mockImplementationOnce(async () => {
        set({plusUnlocked: true});
        return {queryOk: true};
      });
      const {getByTestId, queryByTestId} = renderScreen();

      fireEvent.press(getByTestId('plus-restore'));

      await waitFor(() => expect(getByTestId('plus-done')).toBeTruthy());
      expect(queryByTestId('plus-restore-note')).toBeNull();
    });

    it('shows Restore busy and disabled while a restore runs', () => {
      set({isRestoring: true});
      const {getByTestId} = renderScreen();

      fireEvent.press(getByTestId('plus-restore'));

      expect(getByTestId('plus-restore').props.accessibilityLabel).toBe(
        'Restore',
      );
      expect(getByTestId('plus-restore').props.accessibilityState).toEqual({
        disabled: true,
        busy: true,
      });
      expect(getByTestId('plus-restore-busy')).toBeTruthy();
      expect(purchaseStore.restore).not.toHaveBeenCalled();
    });

    it('disables Restore while paying', () => {
      set({plusFlow: 'paying'});
      const {getByTestId, queryByTestId} = renderScreen();

      fireEvent.press(getByTestId('plus-restore'));

      expect(getByTestId('plus-restore').props.accessibilityState).toEqual({
        disabled: true,
        busy: false,
      });
      expect(queryByTestId('plus-restore-busy')).toBeNull();
      expect(purchaseStore.restore).not.toHaveBeenCalled();
    });

    it('shows no spinner on Restore while idle', () => {
      const {getByTestId, queryByTestId} = renderScreen();

      expect(getByTestId('plus-restore').props.accessibilityLabel).toBe(
        'Restore',
      );
      expect(getByTestId('plus-restore').props.accessibilityState).toEqual({
        disabled: false,
        busy: false,
      });
      expect(queryByTestId('plus-restore-busy')).toBeNull();
    });

    it('says nothing found only once no payment is pending', async () => {
      purchaseStore.restore.mockImplementationOnce(async () => {
        set({plusPending: true});
        return {queryOk: true};
      });
      const {getByTestId, queryByTestId} = renderScreen();

      await act(async () => {
        fireEvent.press(getByTestId('plus-restore'));
      });
      expect(queryByTestId('plus-restore-note')).toBeNull();

      purchaseStore.restore.mockImplementationOnce(async () => {
        set({plusPending: false});
        return {queryOk: true};
      });
      await act(async () => {
        fireEvent.press(getByTestId('plus-restore'));
      });
      expect(getByTestId('plus-restore-note')).toHaveTextContent(
        'No Plus purchase found.',
      );
    });
  });

  describe('announcements', () => {
    const originalOS = Platform.OS;
    let announceSpy: jest.SpyInstance;

    beforeEach(() => {
      announceSpy = jest
        .spyOn(AccessibilityInfo, 'announceForAccessibility')
        .mockImplementation(() => {});
    });

    afterEach(() => {
      (Platform as any).OS = originalOS;
      announceSpy.mockRestore();
    });

    const outcomes: [string, () => void, string, string][] = [
      [
        'no purchase found',
        () => {},
        'plus-restore',
        'No Plus purchase found.',
      ],
      [
        'store unreachable',
        () => purchaseStore.restore.mockResolvedValueOnce({queryOk: false}),
        'plus-restore',
        "Couldn't reach the store. Try again.",
      ],
      [
        'buy error',
        () => purchaseStore.buyPlus.mockResolvedValueOnce('error'),
        'plus-cta',
        "The purchase didn't go through. Try again.",
      ],
      [
        'pending buy',
        () =>
          purchaseStore.buyPlus.mockImplementationOnce(async () => {
            set({plusPending: true});
            return 'pending';
          }),
        'plus-cta',
        'Waiting for the store to confirm your payment.',
      ],
    ];

    it.each(outcomes)(
      'iOS: announces %s once',
      async (_label, arrange, testID, text) => {
        (Platform as any).OS = 'ios';
        arrange();
        const {getByTestId} = renderScreen();

        fireEvent.press(getByTestId('plus-tile-plus.1'));
        await act(async () => {
          fireEvent.press(getByTestId(testID));
        });

        expect(announceSpy.mock.calls).toEqual([[text]]);
      },
    );

    it('iOS: announces the in-development note only when shown', () => {
      (Platform as any).OS = 'ios';
      const {getByTestId} = renderScreen();
      const info = getByTestId('plus-info-localApiServer');

      fireEvent.press(info);
      expect(announceSpy.mock.calls).toEqual([
        ['Features in development may change or not ship.'],
      ]);

      fireEvent.press(info);
      expect(announceSpy).toHaveBeenCalledTimes(1);
    });

    it('Android: leaves the in-development note to the live region', () => {
      (Platform as any).OS = 'android';
      const {getByTestId} = renderScreen();

      fireEvent.press(getByTestId('plus-info-localApiServer'));
      fireEvent.press(getByTestId('plus-info-localApiServer'));

      expect(announceSpy).not.toHaveBeenCalled();
    });

    it.each(outcomes)(
      'Android: leaves %s to the live region',
      async (_label, arrange, testID, text) => {
        (Platform as any).OS = 'android';
        arrange();
        const {getByTestId, getByText} = renderScreen();

        fireEvent.press(getByTestId('plus-tile-plus.1'));
        await act(async () => {
          fireEvent.press(getByTestId(testID));
        });

        expect(announceSpy).not.toHaveBeenCalled();
        expect(getByText(text).props.accessibilityLiveRegion).toBe('polite');
      },
    );
  });

  it('returns to idle when Plus is relocked while open', () => {
    set({plusUnlocked: true});
    const {getByTestId, queryByTestId} = renderScreen();
    expect(queryByTestId('plus-cta')).toBeNull();

    act(() => set({plusUnlocked: false}));

    expect(getByTestId('plus-cta')).toHaveTextContent('Choose an amount');
  });

  describe('layout', () => {
    type Node = ReactTestRendererJSON | string;
    const textOf = (node: Node): string =>
      typeof node === 'string'
        ? node
        : (node.children ?? []).map(textOf).join('');
    const nodeAfter = (node: Node, text: string): Node | undefined => {
      if (typeof node === 'string' || !node.children) {
        return undefined;
      }
      const index = node.children.findIndex(child => textOf(child) === text);
      if (index >= 0) {
        return node.children[index + 1];
      }
      for (const child of node.children) {
        const found = nodeAfter(child, text);
        if (found) {
          return found;
        }
      }
      return undefined;
    };

    it.each([667, 923])(
      'puts the free line, then the prices, right after the speed line at %i dp',
      height => {
        mockWindow.height = height;
        const tree = renderScreen().toJSON() as ReactTestRendererJSON;
        const next = nodeAfter(tree, 'Speed depends on your phone and model.');
        const free = 'Plus is optional. Chatting stays free.';

        expect(textOf(next!)).toBe(free);
        expect(textOf(nodeAfter(tree, free)!)).toBe(
          'Pay what feels right. Every amount unlocks the same features.',
        );
      },
    );

    it.each([false, true])(
      'wraps the centred footer at large text sizes (licence line %s)',
      showsLicenseNotice => {
        set({showsLicenseNotice});
        const {getByTestId} = renderScreen();
        const footer = StyleSheet.flatten(
          getByTestId('plus-footer').props.style,
        );

        expect(footer).toMatchObject({
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'center',
        });
        ['plus-restore', 'plus-open-source'].forEach(testID => {
          expect(
            StyleSheet.flatten(getByTestId(testID).props.style).minHeight,
          ).toBeGreaterThanOrEqual(44);
        });
      },
    );

    const findByTestID = (node: Node, testID: string): Node | undefined => {
      if (typeof node === 'string') {
        return undefined;
      }
      if (node.props.testID === testID) {
        return node;
      }
      for (const child of node.children ?? []) {
        const found = findByTestID(child, testID);
        if (found) {
          return found;
        }
      }
      return undefined;
    };

    it.each([
      [false, ['plus-restore', 'plus-open-source']],
      [true, ['plus-open-source']],
    ])(
      'keeps each footer dot with the item after it (licence line %s)',
      (showsLicenseNotice, afterDots) => {
        set({showsLicenseNotice});
        const tree = renderScreen().toJSON() as ReactTestRendererJSON;
        const footer = findByTestID(
          tree,
          'plus-footer',
        ) as ReactTestRendererJSON;
        const items = footer.children as ReactTestRendererJSON[];

        expect(items.some(item => textOf(item) === '·')).toBe(false);
        const groups = items.filter(
          item => item.children && textOf(item.children[0]) === '·',
        );
        expect(
          groups.map(group => {
            expect(group.children).toHaveLength(2);
            return (group.children![1] as ReactTestRendererJSON).props.testID;
          }),
        ).toEqual(afterDots);
      },
    );

    it('spaces every footer item and dot evenly', () => {
      const {getByTestId, getByText, getAllByText} = renderScreen();
      const padding = (style: unknown) =>
        StyleSheet.flatten(style as any).paddingHorizontal;
      const gap = padding(getByTestId('plus-restore').props.style);

      expect(gap).toBeGreaterThan(0);
      expect(padding(getByText('One-time purchase').props.style)).toBe(gap);
      getAllByText('·').forEach(dot => {
        expect(padding(dot.props.style)).toBe(gap);
      });
      expect(padding(getByTestId('plus-open-source').props.style)).toBe(gap);
    });

    it('lets the price tiles and the main button grow with the text', () => {
      const {getByTestId} = renderScreen();

      ['plus-tile-plus.1', 'plus-cta'].forEach(testID => {
        const style = StyleSheet.flatten(getByTestId(testID).props.style);
        expect(style.minHeight).toBeGreaterThanOrEqual(46);
        expect(style.height).toBeUndefined();
      });
    });

    it('lets the inline error wrap beside its icon', async () => {
      purchaseStore.buyPlus.mockResolvedValueOnce('error');
      const {getByTestId} = renderScreen();

      fireEvent.press(getByTestId('plus-tile-plus.1'));
      fireEvent.press(getByTestId('plus-cta'));
      await waitFor(() => expect(getByTestId('plus-error-line')).toBeTruthy());

      expect(
        StyleSheet.flatten(getByTestId('plus-error-line').props.style)
          .flexShrink,
      ).toBe(1);
    });

    it('uses a tighter gap above the prices on a small phone', () => {
      const {getByText, rerender} = renderScreen();
      const gapBelowSpeedLine = () =>
        StyleSheet.flatten(
          getByText('Speed depends on your phone and model.').props.style,
        ).marginBottom as number;
      const tall = gapBelowSpeedLine();

      mockWindow.height = 667;
      rerender(screenElement(jest.fn()));

      expect(gapBelowSpeedLine()).toBeLessThan(tall);
    });
  });
});
