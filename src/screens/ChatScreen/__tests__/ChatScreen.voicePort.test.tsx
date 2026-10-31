import React from 'react';

import {render} from '../../../../jest/test-utils';
import {chatSessionStore, palStore} from '../../../store';

import {ChatScreen} from '../ChatScreen';

const mockSend = jest.fn().mockResolvedValue(undefined);
const mockStop = jest.fn();
const mockEnd = jest.fn();
let mockPort: {
  send: (text: string, onTurnCreated: (id: string) => void) => Promise<void>;
  stop: () => void;
};

jest.mock('../../../hooks', () => ({
  ...jest.requireActual('../../../hooks'),
  useChatSession: () => ({
    handleSendPress: mockSend,
    handleStopPress: mockStop,
  }),
  useVoiceMode: ({port}: {port: typeof mockPort}) => {
    mockPort = port;
    return {
      requestEntry: jest.fn(),
      sheet: null,
      setupDone: jest.fn(),
      continueAnyway: jest.fn(),
      chooseSmallerModel: jest.fn(),
      dismissSheet: jest.fn(),
      tapCloud: jest.fn(),
      toggleMute: jest.fn(),
      end: mockEnd,
    };
  },
}));

jest.mock('../VideoPalScreen', () => ({
  VideoPalScreen: () => null,
}));

const renderScreen = () =>
  render(<ChatScreen />, {
    withNavigation: true,
    withBottomSheetProvider: true,
  });

describe('ChatScreen voice turn port', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends a spoken turn through the chat send path and hands back its turn id', async () => {
    renderScreen();
    const onTurnCreated = jest.fn();

    await mockPort.send('What is the capital of France?', onTurnCreated);

    expect(mockSend).toHaveBeenCalledWith(
      {text: 'What is the capital of France?', type: 'text'},
      {spoken: true, onTurnCreated},
    );
  });

  it('stops a spoken turn with the chat Stop', () => {
    renderScreen();

    mockPort.stop();

    expect(mockStop).toHaveBeenCalledTimes(1);
  });

  it('ends voice mode when a video Pal takes over the chat', () => {
    const activePal = Object.getOwnPropertyDescriptor(
      chatSessionStore,
      'activePalId',
    )!.get as jest.Mock;
    const pals = palStore.pals;
    palStore.pals = [{id: 'video-pal', capabilities: {video: true}}] as any;
    activePal.mockReturnValue('video-pal');

    renderScreen();

    expect(mockEnd).toHaveBeenCalled();
    activePal.mockReturnValue(null);
    palStore.pals = pals;
  });
});
