import React from 'react';
import {observer} from 'mobx-react';

import {OnboardingScaffold} from './components/OnboardingScaffold';
import {OnboardingBottomBar} from './components/OnboardingBottomBar';
import {OnboardingContent} from './components/OnboardingContent';
import {ItalicAccentTitle} from './components/ItalicAccentTitle';
import {HighlightText} from './components/HighlightText';
import {PhoneWithPals} from './illustrations/PhoneWithPals';
import {useOnboardingHandlers} from './useOnboardingHandlers';

export const Onboarding2Screen: React.FC = observer(() => {
  const {l10n, next, goBack} = useOnboardingHandlers(2);
  const t = l10n.onboarding;
  return (
    <OnboardingScaffold
      step={2}
      illustration={<PhoneWithPals width={120} />}
      content={
        <OnboardingContent
          eyebrow={t.screen2.eyebrow}
          title={
            <ItalicAccentTitle
              title={t.screen2.title}
              accent={t.screen2.titleAccent}
            />
          }
          body={
            <HighlightText
              body={t.screen2.body}
              phrases={[t.screen2.highlight]}
            />
          }
        />
      }
      bottomBar={
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
