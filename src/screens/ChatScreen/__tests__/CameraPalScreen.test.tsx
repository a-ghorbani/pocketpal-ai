import React from 'react';
import {render, fireEvent} from '@testing-library/react-native';
import {CameraPalScreen} from '../CameraPalScreen';
import {modelStore} from '../../../store';
import {L10nContext, UserContext} from '../../../utils';
import {l10n} from '../../../utils/l10n';

// Mock the components and hooks
jest.mock('../../../components/CameraView', () => ({
  CameraView: jest.fn().mockImplementation(({onCapture, onClose}) => (
    <div data-testid="camera-view">
      <button
        data-testid="capture-button"
        onClick={() => onCapture('file:///test/image.jpg')}
      />
      <button data-testid="close-button" onClick={onClose} />
    </div>
  )),
}));

jest.mock('../../../components/ChatView', () => ({
  ChatView: jest.fn().mockImplementation(props => (
    <div data-testid="chat-view">
      <button
        data-testid="stop-button"
        onClick={props.onStopPress}
        disabled={!props.isStopVisible}
      />
      {props.isStreaming && <div data-testid="streaming-indicator" />}
      {props.isThinking && <div data-testid="thinking-indicator" />}
    </div>
  )),
}));

jest.mock('../../../components/Bubble', () => ({
  Bubble: jest.fn().mockImplementation(props => (
    <div data-testid="bubble">{props.message?.text}</div>
  )),
}));

// Mock the modelStore
jest.mock('../../../store', () => ({
  modelStore: {
    context: {
      stopCompletion: jest.fn(),
    },
    isMultimodalEnabled: jest.fn().mockResolvedValue(true),
    startImageCompletion: jest.fn().mockImplementation(({onComplete}) => {
      // Simulate completion after a short delay
      setTimeout(() => {
        onComplete?.('This is an analysis of the image');
      }, 100);
      return Promise.resolve();
    }),
    inferencing: false,
    isStreaming: false,
  },
}));

const mockUser = {
  id: 'user-1',
  firstName: 'Test',
  lastName: 'User',
};

describe('CameraPalScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    modelStore.inferencing = false;
    modelStore.isStreaming = false;
  });

  it('renders correctly with camera button', () => {
    const {getByText} = render(
      <L10nContext.Provider value={l10n.en}>
        <UserContext.Provider value={mockUser}>
          <CameraPalScreen />
        </UserContext.Provider>
      </L10nContext.Provider>,
    );

    expect(getByText('Start Camera')).toBeTruthy();
  });

  it('shows alert when model is not loaded', () => {
    // Mock Alert.alert
    const mockAlert = jest.spyOn(require('react-native'), 'Alert', 'get');
    mockAlert.mockImplementation(() => ({
      alert: jest.fn(),
    }));

    // Mock modelStore.context as null
    const originalContext = modelStore.context;
    modelStore.context = null;

    const {getByText} = render(
      <L10nContext.Provider value={l10n.en}>
        <UserContext.Provider value={mockUser}>
          <CameraPalScreen />
        </UserContext.Provider>
      </L10nContext.Provider>,
    );

    // Click the start camera button
    fireEvent.press(getByText('Start Camera'));

    // Expect Alert.alert to be called
    expect(require('react-native').Alert.alert).toHaveBeenCalledWith(
      'Model not loaded. Please initialize the model.',
      'Load a model to chat.',
      [
        {
          text: 'OK',
        },
      ],
    );

    // Restore modelStore.context
    modelStore.context = originalContext;
    mockAlert.mockRestore();
  });

  // Add more tests as needed
});
