import React from 'react';
import {runInAction} from 'mobx';

import {act, fireEvent, render} from '../../../../jest/test-utils';
import {mockPurchaseStore as purchaseStore} from '../../../../__mocks__/stores/purchaseStore';
import {dismissPlus, plusGate} from '../../../services/plus/gate';
import {setShipOverride} from '../../../services/plus/shipOverride';

jest.mock('../../../services/plus/catalog', () =>
  require('../../../../jest/fixtures/plus').mockUnshippedCatalog(),
);

import {PlusTestFeatureScreen} from '../PlusTestFeatureScreen';

describe('PlusTestFeatureScreen', () => {
  beforeEach(() => {
    setShipOverride(['handsFreeVoice']);
    runInAction(() => {
      purchaseStore.plusUnlocked = false;
      plusGate.request = null;
    });
  });

  afterEach(() => {
    setShipOverride([]);
  });

  it('carries the automation marker', () => {
    const {getByLabelText} = render(<PlusTestFeatureScreen />);

    expect(getByLabelText('PLUS_GATE_PROBE')).toBeTruthy();
  });

  it('opens Plus when locked and shows the feature after an unlock', () => {
    const {getByTestId, queryByTestId} = render(<PlusTestFeatureScreen />);

    fireEvent.press(getByTestId('plus-test-feature-open'));

    expect(plusGate.request?.onUnlocked).toEqual(expect.any(Function));
    expect(queryByTestId('plus-test-feature-unlocked')).toBeNull();

    act(() => {
      runInAction(() => {
        purchaseStore.plusUnlocked = true;
      });
      dismissPlus();
    });

    expect(getByTestId('plus-test-feature-unlocked')).toBeTruthy();
  });

  it('stays locked when Plus is closed without buying', () => {
    const {getByTestId, queryByTestId} = render(<PlusTestFeatureScreen />);

    fireEvent.press(getByTestId('plus-test-feature-open'));
    act(() => dismissPlus());

    expect(queryByTestId('plus-test-feature-unlocked')).toBeNull();
  });

  it('opens directly when Plus is already unlocked', () => {
    runInAction(() => {
      purchaseStore.plusUnlocked = true;
    });
    const {getByTestId} = render(<PlusTestFeatureScreen />);

    fireEvent.press(getByTestId('plus-test-feature-open'));

    expect(getByTestId('plus-test-feature-unlocked')).toBeTruthy();
    expect(plusGate.request).toBeNull();
  });

  it('shows no Plus screen while no Plus feature has shipped', () => {
    setShipOverride([]);
    const {getByTestId, queryByTestId} = render(<PlusTestFeatureScreen />);

    fireEvent.press(getByTestId('plus-test-feature-open'));

    expect(plusGate.request).toBeNull();
    expect(queryByTestId('plus-test-feature-unlocked')).toBeNull();
  });
});
