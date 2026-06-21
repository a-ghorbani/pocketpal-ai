import React from 'react';

import {fireEvent, render, waitFor} from '../../../../jest/test-utils';

import {ModelsHeaderRight} from '../ModelsHeaderRight';

import {uiStore} from '../../../store';

import {l10n} from '../../../locales';

describe('ModelsHeaderRight', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly', () => {
    const {getByTestId} = render(<ModelsHeaderRight />);
    expect(getByTestId('models-menu-button')).toBeTruthy();
  });

  it('calls onAddModel when Add a Model is pressed', () => {
    const onAddModel = jest.fn();
    const {getByTestId} = render(<ModelsHeaderRight onAddModel={onAddModel} />);

    fireEvent.press(getByTestId('models-add-model-button'));

    expect(onAddModel).toHaveBeenCalled();
  });

  it('toggles grouped view when pressed', async () => {
    const {getByTestId, getByText} = render(<ModelsHeaderRight />);

    // Open menu
    fireEvent.press(getByTestId('models-menu-button'));

    // Press group option
    const groupOption = getByText(
      l10n.en.components.modelsHeaderRight.menuTitleGrouped,
    );
    fireEvent.press(groupOption);

    expect(uiStore.setValue).toHaveBeenCalledWith(
      'modelsScreen',
      'filters',
      expect.arrayContaining(['grouped']),
    );
  });

  it('shows reset dialog when reset option is pressed', async () => {
    const {getByTestId, getByText, queryByTestId} = render(
      <ModelsHeaderRight />,
    );

    // Open menu
    fireEvent.press(getByTestId('models-menu-button'));

    // Press reset option
    const resetOption = getByText(
      l10n.en.components.modelsHeaderRight.menuTitleReset,
    );
    fireEvent.press(resetOption);

    await waitFor(() => {
      expect(queryByTestId('reset-dialog')).toBeTruthy();
    });
  });
});
