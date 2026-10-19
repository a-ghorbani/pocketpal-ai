import React from 'react';
import {Linking, StyleSheet} from 'react-native';
import {runInAction} from 'mobx';
import type {ReactTestRendererJSON} from 'react-test-renderer';

import {act, fireEvent, render, waitFor} from '../../../../jest/test-utils';
import {mockPurchaseStore as purchaseStore} from '../../../../__mocks__/stores/purchaseStore';
import type {PlusFeature} from '../../../services/plus/catalog';
import {deviceRam} from '../../../services/plus/deviceRam';
import {setShipOverride} from '../../../services/plus/shipOverride';

import {
  APPLE_EULA_URL,
  APPLE_MEDIA_TERMS_URL,
  PlusScreen,
  REPO_URL,
} from '../PlusScreen';

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

const renderScreen = () => {
  const onClose = jest.fn();
  const screen = render(<PlusScreen onClose={onClose} />, {withSafeArea: true});
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
    });
    openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  });

  afterEach(() => {
    setShipOverride([]);
  });

  describe('idle', () => {
    it('shows the features, the cheapest price selected and Get Plus', () => {
      const {getByTestId, getByText, queryByTestId} = renderScreen();

      expect(getByText('Push local AI further.')).toBeTruthy();
      expect(getByTestId('plus-feature-handsFreeVoice')).toHaveTextContent(
        'Hands-free voiceReady',
      );
      expect(getByTestId('plus-feature-localApiServer')).toHaveTextContent(
        'Local API serverComing soon',
      );
      expect(getByText('Speed depends on your phone and model.')).toBeTruthy();
      expect(
        getByText('Pay what you like. Same features at every price.'),
      ).toBeTruthy();
      expect(getByTestId('plus-tile-plus.1').props.accessibilityState).toEqual({
        checked: true,
        disabled: false,
      });
      expect(getByTestId('plus-cta')).toHaveTextContent('Get Plus · $4.99');
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

    it('preselects the cheapest returned tile', () => {
      setProducts(['plus.3', 'plus.4']);
      const {getByTestId} = renderScreen();

      expect(getByTestId('plus-cta')).toHaveTextContent('Get Plus · $24.99');
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

    expect(getByTestId('plus-cta')).not.toHaveTextContent('Get Plus');
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
    expect(getByTestId('plus-cta').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    expect(queryByTestId('plus-tile-plus.1')).toBeNull();
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

    await act(async () => {
      fireEvent.press(getByTestId('plus-cta'));
    });

    expect(getByTestId('plus-error-line')).toHaveTextContent(
      "The purchase didn't go through. Try again.",
    );
    expect(
      queryByText('Pay what you like. Same features at every price.'),
    ).toBeNull();
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
    const {getByTestId, getByText, queryByTestId, onClose} = renderScreen();

    expect(
      getByText('Thanks for pushing local AI forward with us.'),
    ).toBeTruthy();
    expect(getByTestId('plus-feature-handsFreeVoice')).toBeTruthy();
    expect(queryByTestId('plus-tile-plus.1')).toBeNull();
    expect(queryByTestId('plus-restore')).toBeNull();
    expect(queryByTestId('plus-cta')).toBeNull();

    fireEvent.press(getByTestId('plus-done'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes from any state', () => {
    set({plusPending: true});
    const {getByTestId, onClose} = renderScreen();

    fireEvent.press(getByTestId('plus-close'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe('feature rows', () => {
    it('shows Ready, Needs N GB and Coming soon', () => {
      mockFeatures = [
        {id: 'open', shipped: true},
        {id: 'big', shipped: true, minRamGb: 16},
        {id: 'later', shipped: false},
      ];
      const {getByTestId} = renderScreen();

      expect(getByTestId('plus-feature-open')).toHaveTextContent('openReady');
      expect(getByTestId('plus-feature-big')).toHaveTextContent(
        'bigNeeds 16 GB RAM',
      );
      expect(getByTestId('plus-feature-later')).toHaveTextContent(
        'laterComing soon',
      );
    });

    it('offers Get Plus when one shipped feature runs here', () => {
      mockFeatures = [
        {id: 'open', shipped: true},
        {id: 'later', shipped: false},
      ];
      const {getByTestId} = renderScreen();

      expect(getByTestId('plus-cta')).toHaveTextContent('Get Plus · $4.99');
    });

    it('offers Get Plus anyway when no shipped feature runs here', () => {
      mockFeatures = [
        {id: 'big', shipped: true, minRamGb: 16},
        {id: 'bigger', shipped: true, minRamGb: 24},
      ];
      const {getByTestId, getByText} = renderScreen();

      expect(getByTestId('plus-cta')).toHaveTextContent(
        'Get Plus anyway · $4.99',
      );
      expect(
        getByText(/Plus features don't run on this phone yet/),
      ).toBeTruthy();
    });

    it('withholds RAM-gated rows for an owner until RAM is known', () => {
      mockFeatures = [
        {id: 'big', shipped: true, minRamGb: 16},
        {id: 'open', shipped: true},
      ];
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
      fireEvent.press(info);

      expect(
        getByText('Features in development may change or not ship.'),
      ).toBeTruthy();
      expect(queryByText('Speed depends on your phone and model.')).toBeNull();

      fireEvent.press(info);
      expect(getByText('Speed depends on your phone and model.')).toBeTruthy();
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
    });

    it('shows unavailable when the store returned no Plus product', () => {
      setProducts([]);
      const {getByTestId} = renderScreen();

      expect(getByTestId('plus-unavailable-notice')).toBeTruthy();
    });

    it('leaves the price area blank while loading', () => {
      set({plusChecked: false});
      const {getByTestId, queryByTestId} = renderScreen();

      expect(queryByTestId('plus-unavailable-notice')).toBeNull();
      expect(queryByTestId('plus-cta')).toBeNull();
      expect(queryByTestId('plus-tile-plus.1')).toBeNull();
      expect(getByTestId('plus-restore')).toBeTruthy();
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

    it('disables Restore while a restore runs', () => {
      set({isRestoring: true});
      const {getByTestId} = renderScreen();

      fireEvent.press(getByTestId('plus-restore'));

      expect(getByTestId('plus-restore').props.accessibilityState).toEqual({
        disabled: true,
      });
      expect(purchaseStore.restore).not.toHaveBeenCalled();
    });
  });

  it('returns to idle when Plus is relocked while open', () => {
    set({plusUnlocked: true});
    const {getByTestId, queryByTestId} = renderScreen();
    expect(queryByTestId('plus-cta')).toBeNull();

    act(() => set({plusUnlocked: false}));

    expect(getByTestId('plus-cta')).toHaveTextContent('Get Plus · $4.99');
  });

  describe('layout', () => {
    const speedLineStyle = (height: number) => {
      mockWindow.height = height;
      const {getByText} = renderScreen();
      return StyleSheet.flatten(
        getByText('Speed depends on your phone and model.').props.style,
      );
    };

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
      'puts the prices right after the speed line at %i dp',
      height => {
        mockWindow.height = height;
        const tree = renderScreen().toJSON() as ReactTestRendererJSON;
        const next = nodeAfter(tree, 'Speed depends on your phone and model.');

        expect(textOf(next!)).toBe(
          'Pay what you like. Same features at every price.',
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

    it('lets the inline error wrap beside its icon', async () => {
      purchaseStore.buyPlus.mockResolvedValueOnce('error');
      const {getByTestId} = renderScreen();

      fireEvent.press(getByTestId('plus-cta'));
      await waitFor(() => expect(getByTestId('plus-error-line')).toBeTruthy());

      expect(
        StyleSheet.flatten(getByTestId('plus-error-line').props.style)
          .flexShrink,
      ).toBe(1);
    });

    it('uses a tighter gap above the prices on a small phone', () => {
      expect(speedLineStyle(667).marginBottom).toBeLessThan(
        speedLineStyle(923).marginBottom as number,
      );
    });
  });
});
