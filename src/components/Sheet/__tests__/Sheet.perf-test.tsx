import React, {useState} from 'react';
import {Pressable} from 'react-native';
import {Button, Text} from 'react-native-paper';
import {BottomSheetModal} from '@gorhom/bottom-sheet';
import type {BottomSheetModalMethods} from '@gorhom/bottom-sheet/lib/typescript/types';

import {fireEvent} from '../../../../jest/test-utils';
import {flushTimers, measureScenario} from '../../../../jest/perf';

import {Sheet} from '../Sheet';

const SheetOwner = () => {
  const [isVisible, setIsVisible] = useState(false);
  return (
    <>
      <Pressable testID="perf-toggle" onPress={() => setIsVisible(v => !v)} />
      <Sheet
        title="Perf sheet"
        isVisible={isVisible}
        onClose={() => setIsVisible(false)}>
        <Sheet.ScrollView>
          <Text>Body</Text>
          <Sheet.TextInput testID="perf-sheet-input" />
        </Sheet.ScrollView>
        <Sheet.Actions>
          <Button onPress={() => setIsVisible(false)}>Done</Button>
        </Sheet.Actions>
      </Sheet>
    </>
  );
};

const sheetMethods = (screen: any): BottomSheetModalMethods =>
  screen.UNSAFE_getByType(BottomSheetModal).props.ref.current;

describe('Sheet render performance', () => {
  it('opens and closes from the owner state', async () => {
    await measureScenario(<SheetOwner />, {
      wrapperOptions: {withBottomSheetProvider: true},
      scenario: async screen => {
        await flushTimers();
        const sheet = sheetMethods(screen);
        expect(sheet.present).not.toHaveBeenCalled();

        fireEvent.press(screen.getByTestId('perf-toggle'));
        await flushTimers();
        expect(sheet.present).toHaveBeenCalledTimes(1);

        fireEvent.press(screen.getByTestId('perf-toggle'));
        await flushTimers();
        expect(sheet.close).toHaveBeenCalledTimes(2);
      },
    });
  });
});
