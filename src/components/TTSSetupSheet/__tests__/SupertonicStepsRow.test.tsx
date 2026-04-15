import React from 'react';
import {runInAction} from 'mobx';

import {fireEvent, render} from '../../../../jest/test-utils';

import {L10nContext} from '../../../utils';
import {l10n} from '../../../locales';
import {ttsStore} from '../../../store';

import {SupertonicStepsRow} from '../SupertonicStepsRow';

describe('SupertonicStepsRow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    runInAction(() => {
      ttsStore.supertonicSteps = 3;
    });
  });

  it('renders row with current steps value', () => {
    const {getByTestId} = render(
      <L10nContext.Provider value={l10n.en}>
        <SupertonicStepsRow />
      </L10nContext.Provider>,
    );
    expect(getByTestId('tts-supertonic-steps-row')).toBeTruthy();
  });

  it('tapping a step button calls setSupertonicSteps', () => {
    const {getByText} = render(
      <L10nContext.Provider value={l10n.en}>
        <SupertonicStepsRow />
      </L10nContext.Provider>,
    );
    fireEvent.press(getByText('5'));
    expect(ttsStore.setSupertonicSteps).toHaveBeenCalledWith(5);
  });
});
