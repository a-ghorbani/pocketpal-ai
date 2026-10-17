import React, {useState} from 'react';
import {Pressable} from 'react-native';
import BottomSheet from '@gorhom/bottom-sheet';

import {fireEvent} from '../../../../jest/test-utils';
import {measureScenario} from '../../../../jest/perf';

import {CustomBackdrop} from '../../Sheet/CustomBackdrop';
import {ChatPalModelPickerSheet} from '../ChatPalModelPickerSheet';

const PickerOwner = () => {
  const [isPickerVisible, setIsPickerVisible] = useState(false);
  return (
    <>
      <Pressable
        testID="perf-toggle"
        onPress={() => setIsPickerVisible(v => !v)}
      />
      {isPickerVisible && (
        <ChatPalModelPickerSheet
          isVisible={isPickerVisible}
          onClose={() => setIsPickerVisible(false)}
          chatInputHeight={60}
        />
      )}
    </>
  );
};

describe('ChatPalModelPickerSheet render performance', () => {
  it('opens and closes from the owner state', async () => {
    await measureScenario(<PickerOwner />, {
      wrapperOptions: {withBottomSheetProvider: true},
      scenario: async screen => {
        expect(screen.UNSAFE_queryByType(BottomSheet)).toBeNull();

        fireEvent.press(screen.getByTestId('perf-toggle'));
        expect(
          screen.UNSAFE_getByType(BottomSheet).props.backdropComponent,
        ).toBe(CustomBackdrop);
        expect(screen.getByText('Models')).toBeTruthy();

        fireEvent.press(screen.getByTestId('perf-toggle'));
        expect(screen.UNSAFE_queryByType(BottomSheet)).toBeNull();
      },
    });
  });
});
