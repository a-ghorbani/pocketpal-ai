import React from 'react';
import {View} from 'react-native';
import {Text} from 'react-native-paper';
import {observer} from 'mobx-react';

import {uiStore} from '../../../store';
import {useTheme} from '../../../hooks';
import type {TopicKey} from '../../../store/onboarding/types';
import {OnboardingScaffold} from '../components/OnboardingScaffold';
import {OnboardingBottomBar} from '../components/OnboardingBottomBar';
import {TopicChipGrid} from '../components/TopicChipGrid';
import {useOnboardingHandlers} from '../useOnboardingHandlers';
import {createStyles} from './styles';

export const Onboarding5Screen: React.FC = observer(() => {
  const {l10n, selectTopic, goBack} = useOnboardingHandlers(5);
  const theme = useTheme();
  const styles = createStyles(theme);
  const t = l10n.onboarding;
  const selected = uiStore.onboardingState.selectedTopic;
  const labels = t.screen5.topic as Record<TopicKey, string>;
  const descriptions = t.screen5.topicDescription as Record<TopicKey, string>;
  // Figma `884:28282` omits a back affordance, but the screen sits
  // mid-flow — users need to be able to retreat to screens 2–4. Render
  // a back-only bottom bar (no primary CTA: chips auto-advance).
  return (
    <OnboardingScaffold
      step={5}
      layout="top"
      content={
        <>
          <View style={styles.header}>
            <Text style={styles.title}>{t.screen5.title}</Text>
            <Text style={styles.body}>{t.screen5.body}</Text>
          </View>
          <TopicChipGrid
            selected={selected}
            onSelect={key => selectTopic(key)}
            labels={labels}
            descriptions={descriptions}
          />
        </>
      }
      bottomBar={
        <OnboardingBottomBar
          onBack={goBack}
          backAccessibilityLabel={t.back}
        />
      }
    />
  );
});
