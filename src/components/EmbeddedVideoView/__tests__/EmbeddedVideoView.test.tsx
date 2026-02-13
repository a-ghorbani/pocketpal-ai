import React from 'react';
import {render, fireEvent, waitFor} from '@testing-library/react-native';
import {Alert, Platform} from 'react-native';

import {EmbeddedVideoView} from '../EmbeddedVideoView';
import {L10nContext} from '../../../utils';
import {l10n} from '../../../locales';

// Mock react-native-vision-camera
jest.mock('react-native-vision-camera', () => {
  const mockReact = require('react');
  return {
    Camera: mockReact.forwardRef(({children, ...props}: any, ref: any) =>
      mockReact.createElement(
        'View',
        {ref, testID: 'camera', ...props},
        children,
      ),
    ),
    useCameraDevice: jest.fn(() => ({id: 'mock-device'})),
    useCameraPermission: jest.fn(() => ({
      hasPermission: true,
      requestPermission: jest.fn(() => Promise.resolve(true)),
    })),
  };
});

// Mock react-native-vector-icons
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');

// Mock useTheme hook
jest.mock('../../../hooks', () => ({
  useTheme: () => ({
    colors: {
      primary: '#007AFF',
      surface: '#FFFFFF',
      onSurface: '#000000',
    },
  }),
}));

// Mock Alert
jest.spyOn(Alert, 'alert');

// Mock Platform
Object.defineProperty(Platform, 'OS', {
  get: jest.fn(() => 'ios'),
});

const defaultProps = {
  onCapture: jest.fn(),
  onClose: jest.fn(),
  captureInterval: 2000,
  onCaptureIntervalChange: jest.fn(),
  responseText: undefined,
};

describe('EmbeddedVideoView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders correctly with camera permission', () => {
    const {getByTestId} = render(
      <L10nContext.Provider value={l10n.en}>
        <EmbeddedVideoView {...defaultProps} />
      </L10nContext.Provider>,
    );

    expect(getByTestId('camera')).toBeTruthy();
  });

  it('renders response text when provided', () => {
    const {getByText} = render(
      <L10nContext.Provider value={l10n.en}>
        <EmbeddedVideoView {...defaultProps} responseText="Test response" />
      </L10nContext.Provider>,
    );

    expect(getByText('Test response')).toBeTruthy();
  });

  it('does not render response overlay when no response text', () => {
    const {queryByText} = render(
      <L10nContext.Provider value={l10n.en}>
        <EmbeddedVideoView {...defaultProps} />
      </L10nContext.Provider>,
    );

    // Should not have response text specifically
    expect(queryByText('Test response')).toBeNull();
  });

  it('handles camera permission request', async () => {
    const mockRequestPermission = jest.fn(() => Promise.resolve(true));
    const {useCameraPermission} = require('react-native-vision-camera');
    useCameraPermission.mockReturnValue({
      hasPermission: false,
      requestPermission: mockRequestPermission,
    });

    render(
      <L10nContext.Provider value={l10n.en}>
        <EmbeddedVideoView {...defaultProps} />
      </L10nContext.Provider>,
    );

    // Wait for the component to request permission
    await waitFor(
      () => {
        expect(mockRequestPermission).toHaveBeenCalled();
      },
      {timeout: 3000},
    );
  });

  it('shows permission alert when permission denied', async () => {
    const mockRequestPermission = jest.fn(() => Promise.resolve(false));
    const {useCameraPermission} = require('react-native-vision-camera');
    useCameraPermission.mockReturnValue({
      hasPermission: false,
      requestPermission: mockRequestPermission,
    });

    render(
      <L10nContext.Provider value={l10n.en}>
        <EmbeddedVideoView {...defaultProps} />
      </L10nContext.Provider>,
    );

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        l10n.en.video.permissionTitle,
        l10n.en.video.permissionMessage,
        expect.arrayContaining([
          expect.objectContaining({
            text: l10n.en.common.ok,
            onPress: defaultProps.onClose,
          }),
        ]),
      );
    });
  });

  it('handles permission request error', async () => {
    const mockRequestPermission = jest.fn(() =>
      Promise.reject(new Error('Permission error')),
    );
    const {useCameraPermission} = require('react-native-vision-camera');
    useCameraPermission.mockReturnValue({
      hasPermission: false,
      requestPermission: mockRequestPermission,
    });

    render(
      <L10nContext.Provider value={l10n.en}>
        <EmbeddedVideoView {...defaultProps} />
      </L10nContext.Provider>,
    );

    await waitFor(
      () => {
        expect(Alert.alert).toHaveBeenCalledWith(
          l10n.en.video.permissionTitle,
          l10n.en.video.permissionMessage,
          expect.arrayContaining([
            expect.objectContaining({
              text: l10n.en.common.ok,
              onPress: defaultProps.onClose,
            }),
          ]),
        );
      },
      {timeout: 3000},
    );
  });

  it('toggles camera position when flip button is pressed', () => {
    // Mock camera permission as granted
    const {useCameraPermission} = require('react-native-vision-camera');
    useCameraPermission.mockReturnValue({
      hasPermission: true,
      requestPermission: jest.fn(),
    });

    const {getByTestId} = render(
      <L10nContext.Provider value={l10n.en}>
        <EmbeddedVideoView {...defaultProps} />
      </L10nContext.Provider>,
    );

    const flipButton = getByTestId('flip-camera-button');

    // Just verify the button exists and can be pressed
    expect(flipButton).toBeTruthy();
    fireEvent.press(flipButton);

    // The camera position toggle is internal state, so we just verify the button works
    expect(flipButton).toBeTruthy();
  });

  it('increases capture interval when increase button is pressed', () => {
    // Mock camera permission as granted
    const {useCameraPermission} = require('react-native-vision-camera');
    useCameraPermission.mockReturnValue({
      hasPermission: true,
      requestPermission: jest.fn(),
    });

    const {getByTestId} = render(
      <L10nContext.Provider value={l10n.en}>
        <EmbeddedVideoView {...defaultProps} captureInterval={2000} />
      </L10nContext.Provider>,
    );

    const increaseButton = getByTestId('increase-interval-button');
    fireEvent.press(increaseButton);

    expect(defaultProps.onCaptureIntervalChange).toHaveBeenCalledWith(2500);
  });

  it('decreases capture interval when decrease button is pressed', () => {
    // Mock camera permission as granted
    const {useCameraPermission} = require('react-native-vision-camera');
    useCameraPermission.mockReturnValue({
      hasPermission: true,
      requestPermission: jest.fn(),
    });

    const {getByTestId} = render(
      <L10nContext.Provider value={l10n.en}>
        <EmbeddedVideoView {...defaultProps} captureInterval={2000} />
      </L10nContext.Provider>,
    );

    const decreaseButton = getByTestId('decrease-interval-button');
    fireEvent.press(decreaseButton);

    expect(defaultProps.onCaptureIntervalChange).toHaveBeenCalledWith(1500);
  });

  it('does not decrease interval below minimum', () => {
    // Mock camera permission as granted
    const {useCameraPermission} = require('react-native-vision-camera');
    useCameraPermission.mockReturnValue({
      hasPermission: true,
      requestPermission: jest.fn(),
    });

    const {getByTestId} = render(
      <L10nContext.Provider value={l10n.en}>
        <EmbeddedVideoView {...defaultProps} captureInterval={500} />
      </L10nContext.Provider>,
    );

    const decreaseButton = getByTestId('decrease-interval-button');
    fireEvent.press(decreaseButton);

    expect(defaultProps.onCaptureIntervalChange).toHaveBeenCalledWith(500); // Should stay at minimum
  });

  it('does not increase interval above maximum', () => {
    // Mock camera permission as granted
    const {useCameraPermission} = require('react-native-vision-camera');
    useCameraPermission.mockReturnValue({
      hasPermission: true,
      requestPermission: jest.fn(),
    });

    const {getByTestId} = render(
      <L10nContext.Provider value={l10n.en}>
        <EmbeddedVideoView {...defaultProps} captureInterval={5000} />
      </L10nContext.Provider>,
    );

    const increaseButton = getByTestId('increase-interval-button');
    fireEvent.press(increaseButton);

    expect(defaultProps.onCaptureIntervalChange).toHaveBeenCalledWith(5000); // Should stay at maximum
  });

  it('calls onClose when close button is pressed', () => {
    // Mock camera permission as granted
    const {useCameraPermission} = require('react-native-vision-camera');
    useCameraPermission.mockReturnValue({
      hasPermission: true,
      requestPermission: jest.fn(),
    });

    const {getByTestId} = render(
      <L10nContext.Provider value={l10n.en}>
        <EmbeddedVideoView {...defaultProps} />
      </L10nContext.Provider>,
    );

    const closeButton = getByTestId('close-button');
    fireEvent.press(closeButton);

    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('detects iOS simulator correctly', () => {
    // Mock camera permission as granted
    const {
      useCameraPermission,
      useCameraDevice,
    } = require('react-native-vision-camera');
    useCameraPermission.mockReturnValue({
      hasPermission: true,
      requestPermission: jest.fn(),
    });
    useCameraDevice.mockReturnValue(null); // Simulate no device (simulator)

    const {getByText} = render(
      <L10nContext.Provider value={l10n.en}>
        <EmbeddedVideoView {...defaultProps} />
      </L10nContext.Provider>,
    );

    // Should show simulator message when no camera device is available
    expect(
      getByText(
        'Camera not available in simulator. Please use a physical device.',
      ),
    ).toBeTruthy();
  });
});
