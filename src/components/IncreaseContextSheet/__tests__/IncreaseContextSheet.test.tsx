import React from 'react';

import {fireEvent, render, waitFor} from '../../../../jest/test-utils';

import {L10nContext} from '../../../utils';
import {l10n} from '../../../locales';
import {modelStore} from '../../../store';
import {Model} from '../../../utils/types';
import * as memoryEstimator from '../../../utils/memoryEstimator';

import {IncreaseContextSheet} from '../IncreaseContextSheet';

jest.mock('../../../store', () => ({
  modelStore: {
    contextInitParams: {n_ctx: 4096},
    largestSuccessfulLoad: 8 * 1e9,
    availableMemoryCeiling: 8 * 1e9,
    setNContext: jest.fn(),
    releaseContext: jest.fn().mockResolvedValue(undefined),
    initContext: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('react-native-device-info', () => ({
  getTotalMemory: jest.fn().mockResolvedValue(12 * 1e9),
}));

jest.mock('../../Sheet', () => {
  const {View} = require('react-native');
  const Sheet: any = ({children, isVisible}: any) =>
    isVisible ? <View>{children}</View> : null;
  Sheet.ScrollView = ({children}: any) => <View>{children}</View>;
  Sheet.Actions = ({children}: any) => <View>{children}</View>;
  return {Sheet};
});

jest.mock('@react-native-community/slider', () => {
  const {View} = require('react-native');
  return ({onValueChange, testID}: any) => (
    <View testID={testID} onValueChange={onValueChange} />
  );
});

const model = {
  id: 'model-1',
  name: 'Model 1',
  ggufMetadata: {context_length: 32768},
} as unknown as Model;

const renderSheet = (
  props: Partial<React.ComponentProps<typeof IncreaseContextSheet>> = {},
) =>
  render(
    <L10nContext.Provider value={l10n.en}>
      <IncreaseContextSheet
        isVisible
        model={model}
        currentNCtx={4096}
        onClose={jest.fn()}
        onReloadStart={jest.fn()}
        onReloadResult={jest.fn()}
        onNewChat={jest.fn()}
        {...props}
      />
    </L10nContext.Provider>,
  );

describe('IncreaseContextSheet', () => {
  let memSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    (modelStore.setNContext as jest.Mock).mockReset();
    (modelStore.releaseContext as jest.Mock).mockResolvedValue(undefined);
    (modelStore.initContext as jest.Mock).mockResolvedValue(undefined);
    (modelStore as any).largestSuccessfulLoad = 8 * 1e9;
    (modelStore as any).availableMemoryCeiling = 8 * 1e9;
    // Linear estimate so fit zones are deterministic: 1 GB base + 0.5 GB/4K.
    memSpy = jest
      .spyOn(memoryEstimator, 'getModelMemoryRequirement')
      .mockImplementation(
        (_m, _p, params: any) => 1e9 + (params.n_ctx / 4096) * 0.5e9,
      );
  });

  afterEach(() => {
    memSpy.mockRestore();
  });

  describe('confirm path (restore-on-failure preserved)', () => {
    it('reloads at the chosen n_ctx on confirm', async () => {
      const onReloadResult = jest.fn();
      const {getByTestId} = renderSheet({onReloadResult});
      // Default pick is the smallest fitting stop above current (6144 with the
      // 8 GB ceiling).
      fireEvent.press(getByTestId('increase-context-confirm'));
      await waitFor(() =>
        expect(onReloadResult).toHaveBeenCalledWith(true, 6144),
      );
      expect(modelStore.setNContext).toHaveBeenCalledWith(6144);
      expect(modelStore.initContext).toHaveBeenCalledTimes(1);
    });

    it('re-inits at the prior n_ctx when the reload fails', async () => {
      (modelStore.initContext as jest.Mock)
        .mockRejectedValueOnce(new Error('cancelled'))
        .mockResolvedValueOnce(undefined);
      const onReloadResult = jest.fn();
      const {getByTestId} = renderSheet({onReloadResult});
      fireEvent.press(getByTestId('increase-context-confirm'));

      await waitFor(() =>
        expect(onReloadResult).toHaveBeenCalledWith(false, 6144),
      );
      // Setting restored to the prior n_ctx and the model actually re-loaded.
      expect(modelStore.setNContext).toHaveBeenLastCalledWith(4096);
      expect(modelStore.initContext).toHaveBeenCalledTimes(2);
    });

    it('reports failure even when the restore re-init also fails', async () => {
      (modelStore.initContext as jest.Mock).mockRejectedValue(
        new Error('still failing'),
      );
      const onReloadResult = jest.fn();
      const {getByTestId} = renderSheet({onReloadResult});
      fireEvent.press(getByTestId('increase-context-confirm'));

      await waitFor(() =>
        expect(onReloadResult).toHaveBeenCalledWith(false, 6144),
      );
      expect(modelStore.setNContext).toHaveBeenLastCalledWith(4096);
    });
  });

  describe('slider and capacity', () => {
    it('updates the chosen size and capacity readout when the slider moves', () => {
      const {getByTestId, getByText} = renderSheet();
      // Move to ladder index 0 (6144, the smallest stop above 4096).
      fireEvent(getByTestId('increase-context-slider'), 'onValueChange', 0);
      expect(getByText('6K  tokens')).toBeTruthy();
      // Confirm label reflects the chosen size.
      expect(getByText('Set to 6K')).toBeTruthy();
    });

    it('caps the ladder at the model max', async () => {
      // Top stop is the model max (32768 → "32K · model max").
      const {findByText} = renderSheet();
      expect(await findByText('32K · model max')).toBeTruthy();
    });
  });

  describe('three-zone fit', () => {
    it("disables confirm on a won't-fit stop while the sheet stays open", async () => {
      // Ceiling fits the smaller stops (default pick is enabled), total is low
      // so the largest stop is won't-fit.
      (modelStore as any).largestSuccessfulLoad = 0;
      (modelStore as any).availableMemoryCeiling = 2e9;
      const DeviceInfo = require('react-native-device-info');
      DeviceInfo.getTotalMemory.mockResolvedValueOnce(2.2e9);
      const onReloadResult = jest.fn();
      const {getByTestId} = renderSheet({onReloadResult});
      // Default pick (6144) fits → confirm enabled.
      await waitFor(() =>
        expect(
          getByTestId('increase-context-confirm').props.accessibilityState
            .disabled,
        ).toBeFalsy(),
      );
      // Move to the top stop (32768 → 5e9 req) → won't-fit → confirm disabled.
      fireEvent(getByTestId('increase-context-slider'), 'onValueChange', 11);
      expect(
        getByTestId('increase-context-confirm').props.accessibilityState
          .disabled,
      ).toBe(true);
      fireEvent.press(getByTestId('increase-context-confirm'));
      expect(onReloadResult).not.toHaveBeenCalled();
    });
  });

  describe('no-fit state (OOM-safety relocated)', () => {
    it('hides confirm and offers New chat when nothing fits', async () => {
      (modelStore as any).largestSuccessfulLoad = 1;
      (modelStore as any).availableMemoryCeiling = 1;
      const DeviceInfo = require('react-native-device-info');
      DeviceInfo.getTotalMemory.mockResolvedValueOnce(1);
      const onNewChat = jest.fn();
      const {getByTestId, queryByTestId} = renderSheet({onNewChat});
      await waitFor(() =>
        expect(getByTestId('increase-context-no-fit')).toBeTruthy(),
      );
      // Confirm is HIDDEN (not merely disabled); New chat is reachable.
      expect(queryByTestId('increase-context-confirm')).toBeNull();
      fireEvent.press(getByTestId('increase-context-new-chat'));
      expect(onNewChat).toHaveBeenCalledTimes(1);
    });
  });

  describe('arbitrary current n_ctx', () => {
    it('filters the ladder relative to a non-ladder current value', () => {
      const {getByText} = renderSheet({currentNCtx: 250});
      // Smallest ladder stop above 250 is 2048; it fits the 8 GB ceiling, so
      // it is the default pick.
      expect(getByText('2K  tokens')).toBeTruthy();
    });
  });
});
