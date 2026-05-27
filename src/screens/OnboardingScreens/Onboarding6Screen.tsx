import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {observer} from 'mobx-react';

import {uiStore} from '../../store';
import {useTheme} from '../../hooks';
import type {Theme} from '../../utils/types';
import {RECOMMENDED_PAL_MODEL_SET} from '../../store/onboarding/recommendedPalModelSet';
import {defaultModels} from '../../store/defaultModels';
import {onboardingIllustrationPlaceholders} from '../../assets/onboarding/placeholders';
import {OnboardingScaffold} from './components/OnboardingScaffold';
import {OnboardingBottomBar} from './components/OnboardingBottomBar';
import {OnboardingAudioButton} from './components/OnboardingAudioButton';
import {OnboardingArrowGlyph} from './components/OnboardingArrowGlyph';
import {ItalicAccentTitle} from './components/ItalicAccentTitle';
import {DeviceInfoChip} from './components/DeviceInfoChip';
import {ModelRadioGroup, type ModelOption} from './components/ModelRadioGroup';
import {useOnboardingHandlers} from './useOnboardingHandlers';

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    mascot: {
      alignItems: 'center',
      paddingTop: theme.spacing.m,
      paddingBottom: theme.spacing.s,
    },
    mascotPlaceholder: {
      ...theme.typography.captionS,
      color: theme.colors.onSurfaceVariant,
    },
    body: {
      ...theme.typography.bodyM,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing.m,
    },
    chipRow: {
      marginBottom: theme.spacing.m,
    },
  });

const formatSize = (bytes: number | undefined): string => {
  if (!bytes || bytes <= 0) {
    return '';
  }
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) {
    return `${gb.toFixed(1)} GB`;
  }
  return `${Math.round(bytes / (1024 * 1024))} MB`;
};

export const Onboarding6Screen: React.FC = observer(() => {
  const {l10n, goBack, finish} = useOnboardingHandlers(6);
  const theme = useTheme();
  const styles = createStyles(theme);
  const t = l10n.onboarding;
  const selectedId = uiStore.onboardingState.selectedModelId;
  const canFinish = selectedId !== null;
  const options: ModelOption[] = RECOMMENDED_PAL_MODEL_SET.map(entry => {
    const card = t.screen6.model[entry.tier];
    return {
      id: entry.modelId,
      title: card.title,
      subtitle: card.subtitle,
      recommended: entry.recommended,
    };
  });
  const pickedModel = selectedId
    ? defaultModels.find(m => m.id === selectedId)
    : undefined;
  const sizeLabel = formatSize(pickedModel?.size);
  const primaryLabel = sizeLabel
    ? t.screen6.ctaTemplate.replace('{{size}}', sizeLabel)
    : t.screen6.cta;
  return (
    <OnboardingScaffold
      step={6}
      showStepper={false}
      topRight={
        <OnboardingAudioButton
          titleText={t.screen6.title}
          bodyText={t.screen6.body}
          accessibilityLabel={t.audio}
        />
      }
      illustration={
        <View style={styles.mascot}>
          <Text style={styles.mascotPlaceholder}>
            {onboardingIllustrationPlaceholders.pipMascot}
          </Text>
        </View>
      }
      title={<ItalicAccentTitle title={t.screen6.title} align="center" />}
      body={<Text style={styles.body}>{t.screen6.body}</Text>}
      bottomBar={
        <OnboardingBottomBar
          primaryLabel={primaryLabel}
          primaryTrailing={<OnboardingArrowGlyph glyph="↓" />}
          primaryDisabled={!canFinish}
          onPrimary={finish}
          onBack={goBack}
          backAccessibilityLabel={t.back}
        />
      }>
      <View style={styles.chipRow}>
        <DeviceInfoChip
          ramSuffix={t.screen6.deviceRamSuffix}
          freeSuffix={t.screen6.deviceFreeSuffix}
        />
      </View>
      <ModelRadioGroup
        options={options}
        selectedId={selectedId}
        recommendedBadgeLabel={t.screen6.recommended}
        onSelect={id => uiStore.setOnboardingModelId(id)}
      />
    </OnboardingScaffold>
  );
});
