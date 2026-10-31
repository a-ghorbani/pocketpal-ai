import * as React from 'react';
import {observable, runInAction} from 'mobx';

import {textMessage, user} from '../../../../jest/fixtures';
import {act} from '../../../../jest/test-utils';
import {flushTimers, measureScenario} from '../../../../jest/perf';
import {chatSessionStore, modelStore} from '../../../store';
import {MessageType} from '../../../utils/types';

import {ChatView} from '../ChatView';

const TOKENS = 20;
const FIRST_CONTENT = 'Streaming reply';
const assistant = {id: 'assistant-id'};

const makeHistory = (): MessageType.Any[] => [
  {
    id: 'turn',
    type: 'assistant_turn',
    author: assistant,
    createdAt: 10,
    steps: [{content: FIRST_CONTENT}],
    metadata: {copyable: true},
  },
  ...Array.from({length: 9}, (_, i) => ({
    ...textMessage,
    id: `history-${i}`,
    author: i % 2 === 0 ? user : assistant,
    createdAt: 9 - i,
    text: `History message ${i}`,
  })),
];

const messages = observable.array<MessageType.Any>(makeHistory());

const appendToken = (content: string) =>
  runInAction(() => {
    const turn = messages[0] as MessageType.AssistantTurn;
    const lastIdx = turn.steps.length - 1;
    turn.steps[lastIdx] = {...turn.steps[lastIdx], content};
  });

describe('ChatView render performance', () => {
  beforeAll(() => {
    runInAction(() => {
      modelStore.activeModelId = 'test-model';
      chatSessionStore.agentUiState = {
        status: 'streaming_text',
        pendingTalentNames: [],
        hitMaxTurns: false,
      };
    });
  });

  afterAll(() => {
    runInAction(() => {
      chatSessionStore.agentUiState = {
        status: 'idle',
        pendingTalentNames: [],
        hitMaxTurns: false,
      };
    });
  });

  it('streams tokens into the newest assistant turn', async () => {
    await measureScenario(
      <ChatView
        messages={messages}
        onSendPress={jest.fn()}
        user={user}
        isStreaming
      />,
      {
        wrapperOptions: {withNavigation: true, withBottomSheetProvider: true},
        beforeEach: () => {
          runInAction(() => messages.replace(makeHistory()));
        },
        scenario: async screen => {
          await flushTimers();
          expect(screen.getByText(FIRST_CONTENT)).toBeTruthy();

          let content = FIRST_CONTENT;
          for (let i = 0; i < TOKENS; i++) {
            content += ` token${i}`;
            const next = content;
            await act(() => appendToken(next));
            await flushTimers();
          }

          expect(screen.getByText(content)).toBeTruthy();
        },
      },
    );
  });
});
