import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {observer} from 'mobx-react';

import {uiStore} from '../../store';
import {useTheme} from '../../hooks';
import type {Theme} from '../../utils/types';
import type {TopicKey} from '../../store/onboarding/types';
import {OnboardingScaffold} from './components/OnboardingScaffold';
import {OnboardingAudioButton} from './components/OnboardingAudioButton';
import {OnboardingBackButton} from './components/OnboardingBackButton';
import {TopicChipGrid} from './components/TopicChipGrid';
import {useOnboardingHandlers} from './useOnboardingHandlers';

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    body: {
      ...theme.typography.bodyM,
      color: theme.colors.textSecondary,
      textAlign: 'center',
      marginBottom: theme.spacing.l,
    },
    titleWrap: {
      alignItems: 'center',
    },
  });

export const Onboarding5Screen: React.FC = observer(() => {
  const {l10n, goBack, selectTopic} = useOnboardingHandlers(5);
  const theme = useTheme();
  const styles = createStyles(theme);
  const t = l10n.onboarding;
  const selected = uiStore.onboardingState.selectedTopic;
  const labels = t.screen5.topic as Record<TopicKey, string>;
  return (
    <OnboardingScaffold
      step={5}
      showStepper={false}
      titleAlign="center"
      topLeft={
        <OnboardingBackButton onPress={goBack} accessibilityLabel={t.back} />
      }
      topRight={
        <OnboardingAudioButton
          titleText={t.screen5.title}
          bodyText={t.screen5.body}
          accessibilityLabel={t.audio}
        />
      }
      title={t.screen5.title}
      body={
        <View style={styles.titleWrap}>
          <Text style={styles.body}>{t.screen5.body}</Text>
        </View>
      }
      bottomBar={null}>
      <TopicChipGrid
        selected={selected}
        onSelect={key => selectTopic(key)}
        labels={labels}
      />
    </OnboardingScaffold>
  );
});
