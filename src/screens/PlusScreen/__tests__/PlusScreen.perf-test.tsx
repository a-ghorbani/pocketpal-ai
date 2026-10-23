import React from 'react';
import {runInAction} from 'mobx';

import {act, fireEvent} from '../../../../jest/test-utils';
import {flushTimers, measureScenario} from '../../../../jest/perf';
import {mockPurchaseStore as purchaseStore} from '../../../../__mocks__/stores/purchaseStore';
import {deviceRam} from '../../../services/plus/deviceRam';
import {setShipOverride} from '../../../services/plus/shipOverride';

import {PlusScreen} from '../PlusScreen';

const PRICES = ['$4.99', '$9.99', '$24.99', '$49.99'];

const resetStore = () =>
  runInAction(() => {
    purchaseStore.availability = 'ready';
    purchaseStore.plusChecked = true;
    purchaseStore.plusUnlocked = false;
    purchaseStore.plusPending = false;
    purchaseStore.plusFlow = 'idle';
    purchaseStore.plusProductsLoading = false;
    purchaseStore.products.clear();
    PRICES.forEach((displayPrice, index) => {
      const productId = `plus.${index + 1}`;
      purchaseStore.products.set(productId, {productId, displayPrice});
    });
    deviceRam.ramBytes = 8e9;
  });

describe('PlusScreen render performance', () => {
  beforeAll(() => {
    setShipOverride(['handsFreeVoice']);
  });

  afterAll(() => {
    setShipOverride([]);
  });

  it('selects a price, then follows an unlock and a relock', async () => {
    await measureScenario(<PlusScreen onClose={() => {}} />, {
      wrapperOptions: {withSafeArea: true},
      beforeEach: resetStore,
      scenario: async screen => {
        await flushTimers();
        expect(screen.getByTestId('plus-cta')).toHaveTextContent(
          'Choose an amount',
        );

        fireEvent.press(screen.getByTestId('plus-tile-plus.2'));
        await flushTimers();
        expect(screen.getByTestId('plus-cta')).toHaveTextContent(
          'Get Plus · $9.99',
        );

        await act(() =>
          runInAction(() => {
            purchaseStore.plusUnlocked = true;
          }),
        );
        await flushTimers();
        expect(screen.getByTestId('plus-done')).toBeTruthy();

        await act(() =>
          runInAction(() => {
            purchaseStore.plusUnlocked = false;
          }),
        );
        await flushTimers();
        expect(screen.getByTestId('plus-cta')).toHaveTextContent(
          'Get Plus · $9.99',
        );
      },
    });
  });
});
