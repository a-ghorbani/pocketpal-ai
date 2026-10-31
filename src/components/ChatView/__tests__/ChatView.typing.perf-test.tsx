import * as React from 'react';

import {textMessage, user} from '../../../../jest/fixtures';
import {fireEvent} from '../../../../jest/test-utils';
import {flushTimers, measureScenario} from '../../../../jest/perf';
import {MessageType} from '../../../utils/types';

import {ChatView} from '../ChatView';

const KEYSTROKES = 10;
const TYPED = 'How do I bake bread?';
const assistant = {id: 'assistant-id'};

const history: MessageType.Any[] = Array.from({length: 10}, (_, i) => ({
  ...textMessage,
  id: `history-${i}`,
  author: i % 2 === 0 ? assistant : user,
  createdAt: 10 - i,
  text: `History message ${i}`,
}));

describe('ChatView render performance', () => {
  it('types into the chat input', async () => {
    await measureScenario(
      <ChatView messages={history} onSendPress={jest.fn()} user={user} />,
      {
        wrapperOptions: {withNavigation: true, withBottomSheetProvider: true},
        scenario: async screen => {
          await flushTimers();
          expect(screen.getByTestId('chat-input').props.value).toBe('');

          let typed = '';
          for (let i = 0; i < KEYSTROKES; i++) {
            typed = TYPED.slice(0, i + 1);
            fireEvent.changeText(screen.getByTestId('chat-input'), typed);
            await flushTimers();
          }

          expect(screen.getByTestId('chat-input').props.value).toBe(typed);
        },
      },
    );
  });
});
