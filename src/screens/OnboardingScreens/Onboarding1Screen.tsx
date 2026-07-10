import React from 'react';
import {observer} from 'mobx-react';

import {Screen1Hero} from '../../assets/onboarding/illustrations';
import {OnboardingScaffold} from './components/OnboardingScaffold';
import {OnboardingBottomBar} from './components/OnboardingBottomBar';
import {OnboardingContent} from './components/OnboardingContent';
import {ItalicAccentTitle} from './components/ItalicAccentTitle';
import {HighlightText} from './components/HighlightText';
import {useOnboardingHandlers} from './useOnboardingHandlers';

export const Onboarding1Screen: React.FC = observer(() => {
  const {l10n, next} = useOnboardingHandlers(1);
  const t = l10n.onboarding;
  return (
    <OnboardingScaffold
      step={1}
      illustration={<Screen1Hero width={112} height={112} />}
      content={
        <OnboardingContent
          eyebrow={t.screen1.eyebrow}
          title={
            <ItalicAccentTitle
              title={t.screen1.title}
              accent={t.screen1.titleAccent}
            />
          }
          body={<HighlightText body={t.screen1.body} phrases={[]} />}
        />
      }
      bottomBar={
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
