import {renderHook, act} from '@testing-library/react-native';
import {useChatSession} from '../useChatSession';
import {chatSessionStore, modelStore} from '../../store';
import {MessageType, User} from '../../utils/types';
import {assistant} from '../../utils/chat';

const mockUser: User = {id: 'user_1', firstName: 'Tester'};
const mockAssistant: User = assistant;

describe('useChatSession compaction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    modelStore.context = {
      completion: jest.fn().mockResolvedValue({
        text: 'Mock response',
        tokens_evaluated: 100,
        tokens_predicted: 50,
      }),
      stopCompletion: jest.fn(),
    } as any;
    modelStore.engine = {
      completion: jest.fn().mockResolvedValue({
        text: 'Mock response',
        tokens_evaluated: 100,
        tokens_predicted: 50,
      }),
      stopCompletion: jest.fn(),
    };
    (modelStore as any).context = {id: 'ctx-1'};
    (modelStore as any).activeModelId = 'model-1';
  });

  it('intercepts /compact and warns if message count is too low', async () => {
    jest.spyOn(chatSessionStore, 'addMessageToCurrentSession');
    jest.spyOn(chatSessionStore, 'compactActiveSession');

    // Only 2 messages
    const session = {
      id: 'sess_1',
      title: 'Short chat',
      messagesLoaded: true,
      messages: [
        {id: '1', type: 'text', author: mockUser, text: 'Hello', createdAt: 1000},
        {id: '2', type: 'text', author: mockAssistant, text: 'Hi', createdAt: 2000},
      ],
    };
    chatSessionStore.sessions = [session as any];
    chatSessionStore.activeSessionId = 'sess_1';

    const {result} = renderHook(() =>
      useChatSession({current: null}, mockUser, mockAssistant),
    );

    await act(async () => {
      await result.current.handleSendPress({type: 'text', text: '/compact'});
    });

    expect(chatSessionStore.compactActiveSession).not.toHaveBeenCalled();
    expect(chatSessionStore.addMessageToCurrentSession).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'text',
        text: expect.stringContaining('Not enough messages'),
      }),
    );
  });

  it('intercepts /compact with focus instruction and triggers compaction', async () => {
    const spyCompact = jest
      .spyOn(chatSessionStore, 'compactActiveSession')
      .mockResolvedValue(true);

    // 6 messages in session
    const session = {
      id: 'sess_1',
      title: 'Long chat',
      messagesLoaded: true,
      messages: [
        {id: '1', type: 'text', author: mockUser, text: 'Msg 1', createdAt: 1000},
        {id: '2', type: 'text', author: mockAssistant, text: 'Msg 2', createdAt: 2000},
        {id: '3', type: 'text', author: mockUser, text: 'Msg 3', createdAt: 3000},
        {id: '4', type: 'text', author: mockAssistant, text: 'Msg 4', createdAt: 4000},
        {id: '5', type: 'text', author: mockUser, text: 'Msg 5', createdAt: 5000},
        {id: '6', type: 'text', author: mockAssistant, text: 'Msg 6', createdAt: 6000},
      ],
    };
    chatSessionStore.sessions = [session as any];
    chatSessionStore.activeSessionId = 'sess_1';

    const {result} = renderHook(() =>
      useChatSession({current: null}, mockUser, mockAssistant),
    );

    await act(async () => {
      await result.current.handleSendPress({
        type: 'text',
        text: '/compact keep details about SQLite',
      });
    });

    expect(spyCompact).toHaveBeenCalledWith('keep details about SQLite');
  });
});
