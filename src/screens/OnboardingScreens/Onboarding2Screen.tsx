import React from 'react';
import {observer} from 'mobx-react';

import {OnboardingScaffold} from './components/OnboardingScaffold';
import {OnboardingBottomBar} from './components/OnboardingBottomBar';
import {useOnboardingHandlers} from './useOnboardingHandlers';

export const Onboarding2Screen: React.FC = observer(() => {
  const {l10n, next, goBack, skip} = useOnboardingHandlers(2);
  const t = l10n.onboarding;
  return (
    <OnboardingScaffold
      step={2}
      showStepper
      showSkip
      onSkip={skip}
      skipLabel={t.skip}
      eyebrow={t.screen2.eyebrow}
      title={t.screen2.title}
      body={t.screen2.body}
      bottom={
        <OnboardingBottomBar
          primaryLabel={t.screen2.cta}
          onPrimary={next}
          onBack={goBack}
          backAccessibilityLabel={t.back}
        />
      }
    />
  );
});
