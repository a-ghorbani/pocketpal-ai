import * as React from 'react';
import {runInAction} from 'mobx';

import {user} from '../../../../jest/fixtures';
import {act, fireEvent, render} from '../../../../jest/test-utils';
import {asrStore} from '../../../store';
import {ChatView} from '../ChatView';

jest.useFakeTimers();

jest.mock('../../ChatEmptyPlaceholder', () => ({
  ChatEmptyPlaceholder: jest.fn(() => null),
}));

// Capture the transcript callback ChatView passes down through MicButton, so a
// transcript can be injected without driving the (un-mockable) native mic. The
// callback IS ChatView's real `appendTranscript` seam — that is what's tested.
let capturedOnTranscript: ((text: string) => void) | null = null;
jest.mock('../../../hooks/usePushToTalk', () => ({
  usePushToTalk: ({onTranscript}: {onTranscript: (t: string) => void}) => {
    capturedOnTranscript = onTranscript;
    return {onPressIn: jest.fn(), onPressOut: jest.fn()};
  },
}));

describe('ChatView voice-input append seam', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedOnTranscript = null;
    // Gate open + selected tier ready so MicButton mounts and registers the
    // transcript callback.
    runInAction(() => {
      asrStore.deviceMeetsMemory = true;
      asrStore.userASROverride = true;
      asrStore.selectedTier = 'small';
      asrStore.downloadStates.small = 'ready';
      asrStore.captureState = 'idle';
    });
  });

  const renderChat = (onSendPress = jest.fn()) =>
    render(<ChatView messages={[]} onSendPress={onSendPress} user={user} />, {
      withSafeArea: true,
      withNavigation: true,
      withBottomSheetProvider: true,
    });

  it('appends a transcript onto existing typed text (does not overwrite)', () => {
    const {getByTestId} = renderChat();

    const input = getByTestId('chat-input');
    fireEvent.changeText(input, 'note:');

    expect(capturedOnTranscript).not.toBeNull();
    act(() => capturedOnTranscript?.('buy milk'));

    expect(getByTestId('chat-input').props.value).toBe('note: buy milk');
  });

  it('uses the transcript verbatim when the composer is empty', () => {
    const {getByTestId} = renderChat();

    expect(capturedOnTranscript).not.toBeNull();
    act(() => capturedOnTranscript?.('buy milk'));

    expect(getByTestId('chat-input').props.value).toBe('buy milk');
  });

  it('does not auto-send the transcript', () => {
    const onSendPress = jest.fn();
    const {getByTestId} = renderChat(onSendPress);

    act(() => capturedOnTranscript?.('buy milk'));

    expect(onSendPress).not.toHaveBeenCalled();
    expect(getByTestId('chat-input').props.value).toBe('buy milk');
  });

  it('appends a second transcript onto a prior one (space-joined)', () => {
    const {getByTestId} = renderChat();

    act(() => capturedOnTranscript?.('buy milk'));
    act(() => capturedOnTranscript?.('and eggs'));

    expect(getByTestId('chat-input').props.value).toBe('buy milk and eggs');
  });
});
