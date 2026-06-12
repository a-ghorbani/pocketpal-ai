import React from 'react';
import {runInAction} from 'mobx';

import {render, waitFor} from '../../../../../jest/test-utils';

import {L10nContext} from '../../../../utils';
import {l10n} from '../../../../locales';
import {uiStore} from '../../../../store';
import {TOPIC_TO_PAL} from '../../../../store/onboarding/onboardingPals';

import {Onboarding6Screen} from '../Onboarding6Screen';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    canGoBack: () => true,
  }),
}));

const renderScreen = () =>
  render(
    <L10nContext.Provider value={l10n.en}>
      <Onboarding6Screen />
    </L10nContext.Provider>,
  );

describe('Onboarding6Screen picker', () => {
  beforeEach(() => {
    runInAction(() => {
      uiStore.onboardingState = {
        currentStep: 6,
        selectedTopic: 'education',
        selectedModelId: null,
      };
    });
  });

  it('renders the three Sage tier rows from entry fields (no defaultModels lookup)', async () => {
    const sage = TOPIC_TO_PAL.education;
    const {getByText} = renderScreen();

    await waitFor(() => {
      for (const entry of sage.models) {
        expect(getByText(entry.displayName)).toBeTruthy();
      }
    });
  });

  it('pre-selects the balanced tier on mount via setOnboardingModelId(entryId(recommended))', async () => {
    const sage = TOPIC_TO_PAL.education;
    const recommended = sage.models.find(m => m.recommended)!;
    const expectedId = `${recommended.repo}/${recommended.filename}`;

    renderScreen();

    await waitFor(() => {
      expect(uiStore.setOnboardingModelId).toHaveBeenCalledWith(expectedId);
    });
  });
});
