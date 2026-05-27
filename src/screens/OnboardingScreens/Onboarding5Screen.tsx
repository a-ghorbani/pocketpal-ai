import React from 'react';
import {StyleSheet, View} from 'react-native';
import {Text} from 'react-native-paper';
import {observer} from 'mobx-react';

import {uiStore} from '../../store';
import {useTheme} from '../../hooks';
import type {Theme} from '../../utils/types';
import type {TopicKey} from '../../store/onboarding/types';
import {FONT_FAMILIES} from '../../theme/tokens/typography';
import {OnboardingScaffold} from './components/OnboardingScaffold';
import {OnboardingAudioButton} from './components/OnboardingAudioButton';
import {OnboardingBackButton} from './components/OnboardingBackButton';
import {TopicChipGrid} from './components/TopicChipGrid';
import {useOnboardingHandlers} from './useOnboardingHandlers';

const createStyles = (theme: Theme) => {
  const isFraunces =
    theme.typography.headlineH1.fontFamily === FONT_FAMILIES.FRAUNCES_REGULAR;
  return StyleSheet.create({
    header: {
      width: 369,
      alignItems: 'center',
      gap: theme.spacing.sm,
    },
    title: {
      // Figma `Headline/H2` — Fraunces 24/28, centered.
      fontFamily: isFraunces
        ? FONT_FAMILIES.FRAUNCES_REGULAR
        : FONT_FAMILIES.INTER_MEDIUM,
      fontSize: 24,
      lineHeight: 28,
      color: theme.colors.onBackground,
      textAlign: 'center',
      width: 279,
    },
    body: {
      ...theme.typography.bodyS,
      color: theme.colors.onSurfaceVariant,
      textAlign: 'center',
    },
  });
};

export const Onboarding5Screen: React.FC = observer(() => {
  const {l10n, goBack, selectTopic} = useOnboardingHandlers(5);
  const theme = useTheme();
  const styles = createStyles(theme);
  const t = l10n.onboarding;
  const selected = uiStore.onboardingState.selectedTopic;
  const labels = t.screen5.topic as Record<TopicKey, string>;
  const descriptions = t.screen5.topicDescription as Record<TopicKey, string>;
  return (
    <OnboardingScaffold
      step={5}
      showStepper={false}
      layout="top"
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
      bottomBar={null}
    />
  );
});
