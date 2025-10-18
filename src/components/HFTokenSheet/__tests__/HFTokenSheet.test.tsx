import React from 'react';
import {Linking} from 'react-native';
import {render, fireEvent, waitFor} from '../../../../jest/test-utils';
import {HFTokenSheet} from '../HFTokenSheet';
import {hfStore} from '../../../store';

// Mock Linking - need to spy on the actual Linking object
const mockOpenURL = jest.fn().mockImplementation(() => Promise.resolve());
jest.spyOn(Linking, 'openURL').mockImplementation(mockOpenURL);

jest.mock('../../Sheet', () => {
  const {View, Button} = require('react-native');
  const MockSheet = ({children, isVisible, onClose, title}) => {
    if (!isVisible) {
      return null;
    }
    return (
      <View testID="sheet">
        <View testID="sheet-title">{title}</View>
        <Button title="Close" onPress={onClose} testID="sheet-close-button" />
        {children}
      </View>
    );
  };
  MockSheet.ScrollView = ({children}) => (
    <View testID="sheet-scroll-view">{children}</View>
  );
  MockSheet.Actions = ({children}) => (
    <View testID="sheet-actions">{children}</View>
  );
  return {Sheet: MockSheet};
});

describe('HFTokenSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly with an existing token', () => {
    hfStore.hfToken = 'existing-token';
    const {queryByTestId, getByTestId} = render(
      <HFTokenSheet isVisible={true} onDismiss={jest.fn()} />,
    );

    // Check that the title is displayed
    expect(queryByTestId('sheet-title')).toBeTruthy();

    // Check that the input field is pre-filled with the existing token
    const tokenInput = getByTestId('hf-token-input');
    expect(tokenInput.props.defaultValue).toBe('existing-token');
  });

  it('handles saving a token', async () => {
    const mockOnSave = jest.fn();
    const {getByTestId} = render(
      <HFTokenSheet
        isVisible={true}
        onDismiss={jest.fn()}
        onSave={mockOnSave}
      />,
    );

    // Change token value
    const tokenInput = getByTestId('hf-token-input');
    fireEvent.changeText(tokenInput, 'new-token');

    // Submit the form
    const saveButton = getByTestId('hf-token-save-button');
    fireEvent.press(saveButton);

    // Verify token is saved
    await waitFor(() => {
      expect(hfStore.setToken).toHaveBeenCalledWith('new-token');
      expect(mockOnSave).toHaveBeenCalled();
    });
  });

  it('handles resetting a token', async () => {
    const mockOnSave = jest.fn();
    const {getByTestId} = render(
      <HFTokenSheet
        isVisible={true}
        onDismiss={jest.fn()}
        onSave={mockOnSave}
      />,
    );

    // Click reset button
    const resetButton = getByTestId('hf-token-reset-button');
    fireEvent.press(resetButton);

    // Verify token is cleared
    await waitFor(() => {
      expect(hfStore.clearToken).toHaveBeenCalled();
      expect(mockOnSave).toHaveBeenCalled();
    });
  });

  it('opens the Hugging Face token page when link is clicked', () => {
    const {getByTestId} = render(
      <HFTokenSheet isVisible={true} onDismiss={jest.fn()} />,
    );

    const getTokenLink = getByTestId('hf-token-get-token-link');
    fireEvent.press(getTokenLink);

    // Verify the Linking API was called with the correct URL
    expect(mockOpenURL).toHaveBeenCalledWith(
      'https://huggingface.co/settings/tokens',
    );
  });

  it('toggles password visibility when eye icon is pressed', () => {
    const {getByTestId} = render(
      <HFTokenSheet isVisible={true} onDismiss={jest.fn()} />,
    );

    const tokenInput = getByTestId('hf-token-input');
    expect(tokenInput.props.secureTextEntry).toBe(true);

    // Find the icon button by its props
    const rightIconButton = getByTestId('hf-token-input-icon');
    fireEvent.press(rightIconButton);

    // Now password should be visible (secure entry off)
    expect(tokenInput.props.secureTextEntry).toBe(false);
  });
});
