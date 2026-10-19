import * as React from 'react';
import BottomSheet from '@gorhom/bottom-sheet';

import {textMessage, user} from '../../../../jest/fixtures';
import {fireEvent} from '../../../../jest/test-utils';
import {flushTimers, measureScenario} from '../../../../jest/perf';
import {MessageType} from '../../../utils/types';

import {ChatView} from '../../ChatView';
import {CustomBackdrop} from '../../Sheet/CustomBackdrop';

const assistant = {id: 'assistant-id'};

const history: MessageType.Any[] = Array.from({length: 10}, (_, i) => ({
  ...textMessage,
  id: `history-${i}`,
  author: i % 2 === 0 ? assistant : user,
  createdAt: 10 - i,
  text: `History message ${i}`,
}));

const backdropCount = (screen: any) =>
  screen
    .UNSAFE_queryAllByType(BottomSheet)
    .filter((sheet: any) => sheet.props.backdropComponent === CustomBackdrop)
    .length;

describe('ChatPalModelPickerSheet render performance', () => {
  it('opens and closes the picker from the chat input', async () => {
    await measureScenario(
      <ChatView messages={history} onSendPress={jest.fn()} user={user} />,
      {
        wrapperOptions: {withNavigation: true, withBottomSheetProvider: true},
        scenario: async screen => {
          await flushTimers();
          const closedBackdrops = backdropCount(screen);
          expect(screen.queryByText('Models')).toBeNull();

          fireEvent.press(screen.getByLabelText('Select Pal'));
          await flushTimers();
          expect(screen.getByText('Models')).toBeTruthy();
          expect(backdropCount(screen)).toBe(closedBackdrops + 1);

          fireEvent.press(screen.getByLabelText('Select Pal'));
          await flushTimers();
          expect(screen.queryByText('Models')).toBeNull();
          expect(backdropCount(screen)).toBe(closedBackdrops);
        },
      },
    );
  });
});
