import React from 'react';
import {observer} from 'mobx-react';

import {OnboardingScaffold} from './components/OnboardingScaffold';
import {OnboardingBottomBar} from './components/OnboardingBottomBar';
import {useOnboardingHandlers} from './useOnboardingHandlers';

export const Onboarding4Screen: React.FC = observer(() => {
  const {l10n, next, goBack, skip} = useOnboardingHandlers(4);
  const t = l10n.onboarding;
  return (
    <OnboardingScaffold
      step={4}
      showStepper
      showSkip
      onSkip={skip}
      skipLabel={t.skip}
      eyebrow={t.screen4.eyebrow}
      title={t.screen4.title}
      body={t.screen4.body}
      bottom={
        <OnboardingBottomBar
          primaryLabel={t.screen4.cta}
          onPrimary={next}
          onBack={goBack}
          backAccessibilityLabel={t.back}
        />
      }
    />
  );
});
