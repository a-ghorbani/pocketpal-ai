import React from 'react';

import {fireEvent, render} from '../../../../jest/test-utils';

import {ModelsResetDialog} from '../ModelsResetDialog';

import {l10n} from '../../../locales';

describe('ModelsResetDialog', () => {
  const mockOnDismiss = jest.fn();
  const mockOnReset = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly when visible', () => {
    const {getByTestId, getByText} = render(
      <ModelsResetDialog
        testID="reset-dialog"
        visible={true}
        onDismiss={mockOnDismiss}
        onReset={mockOnReset}
      />,
    );

    // Check if dialog is rendered
    expect(getByTestId('reset-dialog')).toBeTruthy();

    // Check if title is rendered
    expect(
      getByText(l10n.en.components.modelsResetDialog.confirmReset),
    ).toBeTruthy();

    // Check if buttons are rendered
    expect(getByTestId('cancel-reset-button')).toBeTruthy();
    expect(getByTestId('proceed-reset-button')).toBeTruthy();
  });

  it('is not visible when visible prop is false', () => {
    const {queryByTestId} = render(
      <ModelsResetDialog
        testID="reset-dialog"
        visible={false}
        onDismiss={mockOnDismiss}
        onReset={mockOnReset}
      />,
    );

    expect(queryByTestId('reset-dialog')).toBeNull();
  });

  it('calls onDismiss when cancel button is pressed', () => {
    const {getByTestId} = render(
      <ModelsResetDialog
        testID="reset-dialog"
        visible={true}
        onDismiss={mockOnDismiss}
        onReset={mockOnReset}
      />,
    );

    const cancelButton = getByTestId('cancel-reset-button');
    fireEvent.press(cancelButton);

    expect(mockOnDismiss).toHaveBeenCalledTimes(1);
    expect(mockOnReset).not.toHaveBeenCalled();
  });

  it('calls onReset when proceed button is pressed', () => {
    const {getByTestId} = render(
      <ModelsResetDialog
        testID="reset-dialog"
        visible={true}
        onDismiss={mockOnDismiss}
        onReset={mockOnReset}
      />,
    );

    const proceedButton = getByTestId('proceed-reset-button');
    fireEvent.press(proceedButton);

    expect(mockOnReset).toHaveBeenCalledTimes(1);
    expect(mockOnDismiss).not.toHaveBeenCalled();
  });

  it('calls onDismiss when dialog backdrop is pressed', () => {
    const {getByTestId} = render(
      <ModelsResetDialog
        testID="reset-dialog"
        visible={true}
        onDismiss={mockOnDismiss}
        onReset={mockOnReset}
      />,
    );

    // Simulate pressing the dialog backdrop
    fireEvent(getByTestId('reset-dialog'), 'onDismiss');

    expect(mockOnDismiss).toHaveBeenCalledTimes(1);
    expect(mockOnReset).not.toHaveBeenCalled();
  });
});
