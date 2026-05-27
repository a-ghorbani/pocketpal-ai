import React from 'react';
import {AccessibilityInfo} from 'react-native';
import {fireEvent} from '@testing-library/react-native';

import {render} from '../../../../../jest/test-utils';
import {OnboardingAudioButton} from '../OnboardingAudioButton';

describe('OnboardingAudioButton', () => {
  it('announces the joined title + body via AccessibilityInfo on press', () => {
    const spy = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => undefined);
    const {getByTestId} = render(
      <OnboardingAudioButton
        titleText="Meet your pals."
        bodyText="They live on your phone."
        accessibilityLabel="Read aloud"
      />,
    );
    fireEvent.press(getByTestId('onboarding-audio'));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(
      'Meet your pals. They live on your phone.',
    );
    spy.mockRestore();
  });

  it('uses the supplied accessibility label', () => {
    const {getByTestId} = render(
      <OnboardingAudioButton
        titleText="t"
        bodyText="b"
        accessibilityLabel="Read this screen"
      />,
    );
    expect(getByTestId('onboarding-audio').props.accessibilityLabel).toBe(
      'Read this screen',
    );
  });
});
