import React from 'react';
import {observer} from 'mobx-react';

import {uiStore} from '../../store';
import type {TopicKey} from '../../store/onboarding/types';
import {OnboardingScaffold} from './components/OnboardingScaffold';
import {OnboardingBottomBar} from './components/OnboardingBottomBar';
import {TopicChipGrid} from './components/TopicChipGrid';
import {useOnboardingHandlers} from './useOnboardingHandlers';

export const Onboarding5Screen: React.FC = observer(() => {
  const {l10n, next, goBack, skip} = useOnboardingHandlers(5);
  const t = l10n.onboarding;
  const selected = uiStore.onboardingState.selectedTopics;
  const canContinue = selected.length > 0;
  const labels = t.screen5.topic as Record<TopicKey, string>;
  return (
    <OnboardingScaffold
      step={5}
      showStepper={false}
      showSkip
      onSkip={skip}
      skipLabel={t.skip}
      title={t.screen5.title}
      body={t.screen5.body}
      bottom={
        <OnboardingBottomBar
          primaryLabel={t.screen5.cta}
          primaryDisabled={!canContinue}
          onPrimary={next}
          onBack={goBack}
          backAccessibilityLabel={t.back}
        />
      }>
      <TopicChipGrid
        selected={selected}
        onToggle={key => uiStore.toggleOnboardingTopic(key)}
        labels={labels}
      />
    </OnboardingScaffold>
  );
});
