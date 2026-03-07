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

  // A session with a finite (custom) max-tokens cap.
  const finiteSession = () => {
    (chatSessionStore as any).activeSessionId = 'test-session';
    (chatSessionStore as any).sessions = [
      {
        id: 'test-session',
        completionSettings: {temperature: 0.8, top_p: 0.9, n_predict: 2048},
      },
    ];
  };

  // A session left on the default unlimited cap (n_predict === -1).
  const unlimitedSession = () => {
    (chatSessionStore as any).activeSessionId = 'test-session';
    (chatSessionStore as any).sessions = [
      {
        id: 'test-session',
        completionSettings: {temperature: 0.8, top_p: 0.9, n_predict: -1},
      },
    ];
  };

  beforeEach(() => {
    jest.clearAllMocks();
    finiteSession();
  });

  it('renders nothing when not visible', () => {
    const {queryByTestId} = render(
      <QuickGenSettingsSheet isVisible={false} onClose={mockOnClose} />,
    );
    expect(queryByTestId('sheet')).toBeNull();
  });

  it('renders sheet with the sliders and unlimited toggle when visible', () => {
    const {getByTestId} = render(
      <QuickGenSettingsSheet isVisible={true} onClose={mockOnClose} />,
    );
    expect(getByTestId('sheet')).toBeTruthy();
    expect(getByTestId('quick-temperature-slider')).toBeTruthy();
    expect(getByTestId('quick-top-p-slider')).toBeTruthy();
    expect(getByTestId('quick-unlimited-toggle')).toBeTruthy();
    // Finite session -> the max-tokens slider is shown.
    expect(getByTestId('quick-max-tokens-slider')).toBeTruthy();
  });

  it('loads a finite session cap into the max-tokens slider', () => {
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
    expect(getByTestId('quick-unlimited-toggle').props.value).toBe(false);
  });

  it('shows the unlimited toggle on and hides the slider for an unlimited session', () => {
    unlimitedSession();
    const {getByTestId, queryByTestId} = render(
      <QuickGenSettingsSheet isVisible={true} onClose={mockOnClose} />,
    );
    expect(getByTestId('quick-unlimited-toggle').props.value).toBe(true);
    // No finite cap to show while unlimited.
    expect(queryByTestId('quick-max-tokens-slider')).toBeNull();
  });

  it('reveals the max-tokens slider when unlimited is toggled off', () => {
    unlimitedSession();
    const {getByTestId, queryByTestId} = render(
      <QuickGenSettingsSheet isVisible={true} onClose={mockOnClose} />,
    );
    expect(queryByTestId('quick-max-tokens-slider')).toBeNull();

    act(() => {
      fireEvent(getByTestId('quick-unlimited-toggle'), 'valueChange', false);
    });

    // Slider appears at the finite fallback (1024).
    expect(getByTestId('quick-max-tokens-slider')).toBeTruthy();
    expect(getByTestId('quick-max-tokens-slider-value').props.children).toBe(
      1024,
    );
  });

  it('saves a finite cap on apply', async () => {
    const {getByTestId} = render(
      <QuickGenSettingsSheet isVisible={true} onClose={mockOnClose} />,
    );

    await act(async () => {
      fireEvent.press(getByTestId('quick-gen-apply'));
    });

    expect(
      chatSessionStore.updateSessionCompletionSettings,
    ).toHaveBeenCalledWith(
      expect.objectContaining({temperature: 0.8, top_p: 0.9, n_predict: 2048}),
    );
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('preserves unlimited (n_predict: -1) on apply when the toggle stays on', async () => {
    unlimitedSession();
    const {getByTestId} = render(
      <QuickGenSettingsSheet isVisible={true} onClose={mockOnClose} />,
    );

    await act(async () => {
      fireEvent.press(getByTestId('quick-gen-apply'));
    });

    expect(
      chatSessionStore.updateSessionCompletionSettings,
    ).toHaveBeenCalledWith(expect.objectContaining({n_predict: -1}));
  });

  it('caps a previously-unlimited session when the toggle is turned off', async () => {
    unlimitedSession();
    const {getByTestId} = render(
      <QuickGenSettingsSheet isVisible={true} onClose={mockOnClose} />,
    );

    act(() => {
      fireEvent(getByTestId('quick-unlimited-toggle'), 'valueChange', false);
    });
    await act(async () => {
      fireEvent.press(getByTestId('quick-gen-apply'));
    });

    expect(
      chatSessionStore.updateSessionCompletionSettings,
    ).toHaveBeenCalledWith(expect.objectContaining({n_predict: 1024}));
  });

  it('resets to the unlimited default on reset', () => {
    // Default n_predict is -1 (unlimited) since #687.
    const {getByTestId, queryByTestId} = render(
      <QuickGenSettingsSheet isVisible={true} onClose={mockOnClose} />,
    );

    act(() => {
      fireEvent.press(getByTestId('quick-gen-reset'));
    });

    expect(getByTestId('quick-temperature-slider-value').props.children).toBe(
      0.7,
    );
    expect(getByTestId('quick-unlimited-toggle').props.value).toBe(true);
    expect(queryByTestId('quick-max-tokens-slider')).toBeNull();
  });

  it('falls back to the unlimited default when no active session', () => {
    (chatSessionStore as any).activeSessionId = null;

    const {getByTestId, queryByTestId} = render(
      <QuickGenSettingsSheet isVisible={true} onClose={mockOnClose} />,
    );

    expect(getByTestId('quick-temperature-slider-value').props.children).toBe(
      0.7,
    );
    expect(getByTestId('quick-top-p-slider-value').props.children).toBe(0.95);
    expect(getByTestId('quick-unlimited-toggle').props.value).toBe(true);
    expect(queryByTestId('quick-max-tokens-slider')).toBeNull();
  });
});
