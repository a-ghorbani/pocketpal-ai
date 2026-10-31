import React from 'react';

import {fireEvent} from '../../../../jest/test-utils';
import {flushTimers, measureScenario} from '../../../../jest/perf';

import {SettingsScreen} from '../SettingsScreen';

describe('SettingsScreen render performance', () => {
  it('expands the advanced settings', async () => {
    await measureScenario(<SettingsScreen />, {
      wrapperOptions: {
        withSafeArea: true,
        withNavigation: true,
        withBottomSheetProvider: true,
      },
      scenario: async screen => {
        await flushTimers();
        expect(screen.queryByTestId('batch-size-slider')).toBeNull();

        fireEvent.press(screen.getByTestId('advanced-settings-accordion'));
        await flushTimers();

        expect(screen.getByTestId('batch-size-slider')).toBeTruthy();
      },
    });
  });
});
