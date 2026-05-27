import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {observer} from 'mobx-react';

import {uiStore} from '../../store';
import {useTheme} from '../../hooks';
import type {Theme} from '../../utils/types';
import {RECOMMENDED_PAL_MODEL_SET} from '../../store/onboarding/recommendedPalModelSet';
import {OnboardingScaffold} from './components/OnboardingScaffold';
import {OnboardingBottomBar} from './components/OnboardingBottomBar';
import {ModelRadioGroup, type ModelOption} from './components/ModelRadioGroup';
import {useOnboardingHandlers} from './useOnboardingHandlers';

// Placeholder until the screen-6 retrofit lands its real card layout.

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    deviceChip: {
      alignSelf: 'flex-start',
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
      borderRadius: theme.radius.s,
      backgroundColor: theme.colors.surfaceVariant,
      marginBottom: theme.spacing.m,
    },
    deviceChipText: {
      ...theme.typography.captionM,
      color: theme.colors.onSurfaceVariant,
    },
  });

export const Onboarding6Screen: React.FC = observer(() => {
  const {l10n, goBack, skip, finish} = useOnboardingHandlers(6);
  const theme = useTheme();
  const styles = createStyles(theme);
  const t = l10n.onboarding;
  const selectedId = uiStore.onboardingState.selectedModelId;
  const canFinish = selectedId !== null;
  const options: ModelOption[] = RECOMMENDED_PAL_MODEL_SET.map(entry => {
    const card = t.screen6.model[entry.tier];
    return {id: entry.modelId, title: card.title, subtitle: card.subtitle};
  });
  return (
    <OnboardingScaffold
      step={6}
      showStepper={false}
      showSkip
      onSkip={skip}
      skipLabel={t.skip}
      eyebrow={t.screen6.eyebrow}
      title={t.screen6.title}
      body={t.screen6.body}
      bottom={
        <OnboardingBottomBar
          primaryLabel={t.screen6.cta}
          primaryDisabled={!canFinish}
          onPrimary={finish}
          onBack={goBack}
          backAccessibilityLabel={t.back}
        />
      }>
      <View testID="onboarding-device-chip" style={styles.deviceChip}>
        <Text style={styles.deviceChipText}>{t.screen6.deviceChip}</Text>
      </View>
      <ModelRadioGroup
        options={options}
        selectedId={selectedId}
        onSelect={id => uiStore.setOnboardingModelId(id)}
      />
    </OnboardingScaffold>
  );
});
