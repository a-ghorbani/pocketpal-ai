import React from 'react';
import {observer} from 'mobx-react';

import {OnboardingScaffold} from './components/OnboardingScaffold';
import {OnboardingBottomBar} from './components/OnboardingBottomBar';
import {useOnboardingHandlers} from './useOnboardingHandlers';

export const Onboarding1Screen: React.FC = observer(() => {
  const {l10n, next} = useOnboardingHandlers(1);
  const t = l10n.onboarding;
  return (
    <OnboardingScaffold
      step={1}
      showStepper
      showSkip={false}
      skipLabel={t.skip}
      eyebrow={t.screen1.eyebrow}
      title={t.screen1.title}
      body={t.screen1.body}
      bottom={
        <OnboardingBottomBar
          primaryLabel={t.screen1.cta}
          onPrimary={next}
          showBack={false}
          backAccessibilityLabel={t.back}
        />
      }
    />
  );
});
