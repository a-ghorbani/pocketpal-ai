import React from 'react';
import {observer} from 'mobx-react';

import {OnboardingScaffold} from './components/OnboardingScaffold';
import {OnboardingBottomBar} from './components/OnboardingBottomBar';
import {useOnboardingHandlers} from './useOnboardingHandlers';

export const Onboarding3Screen: React.FC = observer(() => {
  const {l10n, next, goBack, skip} = useOnboardingHandlers(3);
  const t = l10n.onboarding;
  return (
    <OnboardingScaffold
      step={3}
      showStepper
      showSkip
      onSkip={skip}
      skipLabel={t.skip}
      eyebrow={t.screen3.eyebrow}
      title={t.screen3.title}
      body={t.screen3.body}
      bottom={
        <OnboardingBottomBar
          primaryLabel={t.screen3.cta}
          onPrimary={next}
          onBack={goBack}
          backAccessibilityLabel={t.back}
        />
      }
    />
  );
});
