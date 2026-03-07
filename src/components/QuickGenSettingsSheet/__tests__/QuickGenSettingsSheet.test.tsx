import React from 'react';
import {fireEvent, render, act} from '../../../../jest/test-utils';
import {QuickGenSettingsSheet} from '../QuickGenSettingsSheet';
import {chatSessionStore} from '../../../store';

// Mock Sheet component
jest.mock('../../Sheet/Sheet', () => {
  const {View, TouchableOpacity, Text} = require('react-native');
  const MockSheet = ({
    children,
    isVisible,
    onClose,
    title,
  }: {
    children: React.ReactNode;
    isVisible: boolean;
    onClose: () => void;
    title: string;
  }) => {
    if (!isVisible) {
      return null;
    }
    return (
      <View testID="sheet">
        <Text testID="sheet-title">{title}</Text>
        <TouchableOpacity
          testID="sheet-close-button"
          onPress={onClose}
          accessibilityRole="button">
          <Text>Close</Text>
        </TouchableOpacity>
        {children}
      </View>
    );
  };
  MockSheet.ScrollView = ({children}: {children: React.ReactNode}) => (
    <View testID="sheet-scroll-view">{children}</View>
  );
  return {Sheet: MockSheet};
});

// Mock InputSlider
jest.mock('../../InputSlider', () => {
  const {View, Text} = require('react-native');
  return {
    InputSlider: ({
      label,
      value,
      testID,
      onValueChange,
    }: {
      label: string;
      value: number;
      testID: string;
      onValueChange: (v: number) => void;
    }) => (
      <View testID={testID}>
        <Text testID={`${testID}-label`}>{label}</Text>
        <Text testID={`${testID}-value`}>{value}</Text>
        <Text testID={`${testID}-trigger`} onPress={() => onValueChange(1.5)} />
      </View>
    ),
  };
});

describe('QuickGenSettingsSheet', () => {
  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (chatSessionStore as any).activeSessionId = 'test-session';
    (chatSessionStore as any).sessions = [
      {
        id: 'test-session',
        completionSettings: {
          temperature: 0.8,
          top_p: 0.9,
          n_predict: 2048,
        },
      },
    ];
  });

  it('renders nothing when not visible', () => {
    const {queryByTestId} = render(
      <QuickGenSettingsSheet isVisible={false} onClose={mockOnClose} />,
    );
    expect(queryByTestId('sheet')).toBeNull();
  });

  it('renders sheet with sliders when visible', () => {
    const {getByTestId} = render(
      <QuickGenSettingsSheet isVisible={true} onClose={mockOnClose} />,
    );
    expect(getByTestId('sheet')).toBeTruthy();
    expect(getByTestId('quick-temperature-slider')).toBeTruthy();
    expect(getByTestId('quick-top-p-slider')).toBeTruthy();
    expect(getByTestId('quick-max-tokens-slider')).toBeTruthy();
  });

  it('loads session settings into sliders', () => {
    const {getByTestId} = render(
      <QuickGenSettingsSheet isVisible={true} onClose={mockOnClose} />,
    );
    expect(getByTestId('quick-temperature-slider-value').props.children).toBe(
      0.8,
    );
    expect(getByTestId('quick-top-p-slider-value').props.children).toBe(0.9);
    expect(getByTestId('quick-max-tokens-slider-value').props.children).toBe(
      2048,
    );
  });

  it('calls updateSessionCompletionSettings on apply', async () => {
    const {getByTestId} = render(
      <QuickGenSettingsSheet isVisible={true} onClose={mockOnClose} />,
    );

    await act(async () => {
      fireEvent.press(getByTestId('quick-gen-apply'));
    });

    expect(
      chatSessionStore.updateSessionCompletionSettings,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: 0.8,
        top_p: 0.9,
        n_predict: 2048,
      }),
    );
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('resets sliders to defaults on reset', () => {
    const {getByTestId} = render(
      <QuickGenSettingsSheet isVisible={true} onClose={mockOnClose} />,
    );

    act(() => {
      fireEvent.press(getByTestId('quick-gen-reset'));
    });

    // After reset, temperature should be default (0.7)
    expect(getByTestId('quick-temperature-slider-value').props.children).toBe(
      0.7,
    );
  });

  it('falls back to defaults when no active session', () => {
    (chatSessionStore as any).activeSessionId = null;

    const {getByTestId} = render(
      <QuickGenSettingsSheet isVisible={true} onClose={mockOnClose} />,
    );

    // Should show default values
    expect(getByTestId('quick-temperature-slider-value').props.children).toBe(
      0.7,
    );
    expect(getByTestId('quick-top-p-slider-value').props.children).toBe(0.95);
    expect(getByTestId('quick-max-tokens-slider-value').props.children).toBe(
      1024,
    );
  });
});
