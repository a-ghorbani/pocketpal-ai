/**
 * Tests for ChatInput thinking toggle functionality
 */

import React from 'react';
import {render, fireEvent} from '@testing-library/react-native';
import {ChatInput} from '../ChatInput';
import {UserContext} from '../../../utils';

// Mock the theme hook
jest.mock('../../../hooks', () => ({
  useTheme: () => ({
    colors: {
      primary: '#007AFF',
      onPrimary: '#FFFFFF',
      surface: '#FFFFFF',
      onSurface: '#000000',
      inverseOnSurface: '#FFFFFF',
      inverseSurface: '#000000',
      onSurfaceVariant: '#666666',
    },
    fonts: {
      inputTextStyle: {
        fontSize: 16,
        fontFamily: 'System',
      },
    },
  }),
}));

// Mock the stores
jest.mock('../../../store', () => ({
  chatSessionStore: {
    activePalId: null,
  },
  modelStore: {
    activeModel: null,
  },
  palStore: {
    pals: [],
  },
  uiStore: {
    colorScheme: 'light',
  },
  ttsStore: {
    isTTSAvailable: false,
    currentVoice: null,
    autoSpeakEnabled: false,
    playbackState: {mode: 'idle'},
    openSetupSheet: jest.fn(),
    setAutoSpeak: jest.fn(),
  },
}));

// Mock the icons
jest.mock('../../../assets/icons', () => ({
  ChevronUpIcon: 'ChevronUpIcon',
  VideoRecorderIcon: 'VideoRecorderIcon',
  PlusIcon: 'PlusIcon',
  AtomIcon: 'AtomIcon',
}));

// Mock the components
jest.mock('../../SendButton', () => ({
  SendButton: 'SendButton',
}));

jest.mock('../../StopButton', () => ({
  StopButton: 'StopButton',
}));

jest.mock('../../Menu', () => ({
  Menu: {
    Item: 'MenuItem',
  },
}));

const mockUser = {
  id: 'test-user',
  firstName: 'Test',
  lastName: 'User',
};

describe('ChatInput Thinking Toggle', () => {
  const defaultProps = {
    onSendPress: jest.fn(),
    onStopPress: jest.fn(),
    onPalBtnPress: jest.fn(),
    isStopVisible: false,
    sendButtonVisibilityMode: 'editing' as const,
    isPickerVisible: false,
    textInputProps: {},
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should not render thinking toggle when showThinkingToggle is false', () => {
    const {queryByLabelText} = render(
      <UserContext.Provider value={mockUser}>
        <ChatInput
          {...defaultProps}
          showThinkingToggle={false}
          isThinkingEnabled={false}
          onThinkingToggle={jest.fn()}
        />
      </UserContext.Provider>,
    );

    expect(queryByLabelText(/thinking mode/i)).toBeNull();
  });

  it('should render thinking toggle when showThinkingToggle is true', () => {
    const {getByLabelText} = render(
      <UserContext.Provider value={mockUser}>
        <ChatInput
          {...defaultProps}
          showThinkingToggle={true}
          isThinkingEnabled={false}
          onThinkingToggle={jest.fn()}
        />
      </UserContext.Provider>,
    );

    expect(getByLabelText('Enable thinking mode')).toBeTruthy();
  });

  it('should show correct accessibility label when thinking is disabled', () => {
    const {getByLabelText} = render(
      <UserContext.Provider value={mockUser}>
        <ChatInput
          {...defaultProps}
          showThinkingToggle={true}
          isThinkingEnabled={false}
          onThinkingToggle={jest.fn()}
        />
      </UserContext.Provider>,
    );

    expect(getByLabelText('Enable thinking mode')).toBeTruthy();
  });

  it('should show correct accessibility label when thinking is enabled', () => {
    const {getByLabelText} = render(
      <UserContext.Provider value={mockUser}>
        <ChatInput
          {...defaultProps}
          showThinkingToggle={true}
          isThinkingEnabled={true}
          onThinkingToggle={jest.fn()}
        />
      </UserContext.Provider>,
    );

    expect(getByLabelText('Disable thinking mode')).toBeTruthy();
  });

  it('should call onThinkingToggle with correct value when pressed', () => {
    const mockOnThinkingToggle = jest.fn();
    const {getByLabelText} = render(
      <UserContext.Provider value={mockUser}>
        <ChatInput
          {...defaultProps}
          showThinkingToggle={true}
          isThinkingEnabled={false}
          onThinkingToggle={mockOnThinkingToggle}
        />
      </UserContext.Provider>,
    );

    const toggleButton = getByLabelText('Enable thinking mode');
    fireEvent.press(toggleButton);

    expect(mockOnThinkingToggle).toHaveBeenCalledWith(true);
  });

  it('should call onThinkingToggle with false when thinking is enabled and pressed', () => {
    const mockOnThinkingToggle = jest.fn();
    const {getByLabelText} = render(
      <UserContext.Provider value={mockUser}>
        <ChatInput
          {...defaultProps}
          showThinkingToggle={true}
          isThinkingEnabled={true}
          onThinkingToggle={mockOnThinkingToggle}
        />
      </UserContext.Provider>,
    );

    const toggleButton = getByLabelText('Disable thinking mode');
    fireEvent.press(toggleButton);

    expect(mockOnThinkingToggle).toHaveBeenCalledWith(false);
  });

  it('should render thinking toggle even when streaming', () => {
    const {getByLabelText} = render(
      <UserContext.Provider value={mockUser}>
        <ChatInput
          {...defaultProps}
          isStreaming={true}
          showThinkingToggle={true}
          isThinkingEnabled={false}
          onThinkingToggle={jest.fn()}
        />
      </UserContext.Provider>,
    );

    expect(getByLabelText('Enable thinking mode')).toBeTruthy();
  });

  it('should render thinking toggle even when stop is visible', () => {
    const {getByLabelText} = render(
      <UserContext.Provider value={mockUser}>
        <ChatInput
          {...defaultProps}
          isStopVisible={true}
          showThinkingToggle={true}
          isThinkingEnabled={false}
          onThinkingToggle={jest.fn()}
        />
      </UserContext.Provider>,
    );

    expect(getByLabelText('Enable thinking mode')).toBeTruthy();
  });

  it('should handle missing onThinkingToggle callback gracefully', () => {
    const {getByLabelText} = render(
      <UserContext.Provider value={mockUser}>
        <ChatInput
          {...defaultProps}
          showThinkingToggle={true}
          isThinkingEnabled={false}
          onThinkingToggle={undefined}
        />
      </UserContext.Provider>,
    );

    const toggleButton = getByLabelText('Enable thinking mode');

    // Should not throw when pressed
    expect(() => fireEvent.press(toggleButton)).not.toThrow();
  });
});
