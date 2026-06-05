import React from 'react';

import {fireEvent, render, waitFor} from '../../../../jest/test-utils';

import {L10nContext} from '../../../utils';
import {l10n} from '../../../locales';
import {modelStore} from '../../../store';

import {IncreaseContextSheet} from '../IncreaseContextSheet';

jest.mock('../../../store', () => ({
  modelStore: {
    activeModel: {id: 'model-1', name: 'Model 1'},
    contextInitParams: {n_ctx: 4096},
    setNContext: jest.fn(),
    releaseContext: jest.fn().mockResolvedValue(undefined),
    initContext: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../Sheet', () => {
  const {View} = require('react-native');
  const Sheet: any = ({children, isVisible}: any) =>
    isVisible ? <View>{children}</View> : null;
  Sheet.ScrollView = ({children}: any) => <View>{children}</View>;
  Sheet.Actions = ({children}: any) => <View>{children}</View>;
  return {Sheet};
});

const renderSheet = (
  props: Partial<React.ComponentProps<typeof IncreaseContextSheet>> = {},
) =>
  render(
    <L10nContext.Provider value={l10n.en}>
      <IncreaseContextSheet
        target={8192}
        onClose={jest.fn()}
        onReloadStart={jest.fn()}
        onReloadResult={jest.fn()}
        {...props}
      />
    </L10nContext.Provider>,
  );

describe('IncreaseContextSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (modelStore.setNContext as jest.Mock).mockReset();
    (modelStore.releaseContext as jest.Mock).mockResolvedValue(undefined);
    (modelStore.initContext as jest.Mock).mockResolvedValue(undefined);
  });

  it('reloads at the target n_ctx on confirm', async () => {
    const onReloadResult = jest.fn();
    const {getByTestId} = renderSheet({onReloadResult});
    fireEvent.press(getByTestId('increase-context-confirm'));
    await waitFor(() => expect(onReloadResult).toHaveBeenCalledWith(true, 8192));
    expect(modelStore.setNContext).toHaveBeenCalledWith(8192);
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
      expect(onReloadResult).toHaveBeenCalledWith(false, 8192),
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
      expect(onReloadResult).toHaveBeenCalledWith(false, 8192),
    );
    expect(modelStore.setNContext).toHaveBeenLastCalledWith(4096);
  });
});
