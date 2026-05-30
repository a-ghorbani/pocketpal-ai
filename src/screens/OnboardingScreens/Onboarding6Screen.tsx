import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {observer} from 'mobx-react';

import {uiStore} from '../../store';
import {useTheme} from '../../hooks';
import type {Theme} from '../../utils/types';
import {RECOMMENDED_PAL_MODEL_SET} from '../../store/onboarding/recommendedPalModelSet';
import {defaultModels} from '../../store/defaultModels';
import {OnboardingScaffold} from './components/OnboardingScaffold';
import {OnboardingBottomBar} from './components/OnboardingBottomBar';
import {ItalicAccentTitle} from './components/ItalicAccentTitle';
import {DeviceInfoChip} from './components/DeviceInfoChip';
import {ModelRadioGroup, type ModelOption} from './components/ModelRadioGroup';
import {PipMascot} from './illustrations/PipMascot';
import {useOnboardingHandlers} from './useOnboardingHandlers';

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    header: {
      alignItems: 'center',
      gap: theme.spacing.sm,
      paddingHorizontal: theme.spacing.m,
    },
    pipBody: {
      ...theme.typography.bodyS,
      color: theme.colors.onSurfaceVariant,
      textAlign: 'center',
      width: 335,
    },
    subtitle: {
      ...theme.typography.bodyS,
      color: theme.colors.onSurfaceVariant,
      textAlign: 'center',
      marginTop: theme.spacing.ml,
      marginBottom: theme.spacing.s,
    },
    options: {
      width: 335,
      alignSelf: 'center',
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
      layout="top"
      content={
        <>
          <View style={styles.header}>
            <PipMascot width={66} />
            <ItalicAccentTitle title={t.screen6.title} align="center" />
            <Text style={styles.pipBody}>{t.screen6.body}</Text>
          </View>
          <DeviceInfoChip
            ramSuffix={t.screen6.deviceRamSuffix}
            freeSuffix={t.screen6.deviceFreeSuffix}
          />
          <View style={styles.options}>
            <Text style={styles.subtitle}>
              {(t.screen6 as {subtitle?: string}).subtitle ?? ''}
            </Text>
            <ModelRadioGroup
              options={options}
              selectedId={selectedId}
              recommendedBadgeLabel={t.screen6.recommended}
              onSelect={id => uiStore.setOnboardingModelId(id)}
            />
          </View>
        </>
      }
      bottomBar={
        <OnboardingBottomBar
          elevated
          primaryLabel={primaryLabel}
          primaryGlyph="download"
          primaryGlyphPosition="leading"
          primaryDisabled={!canFinish}
          onPrimary={finish}
          onBack={goBack}
          backAccessibilityLabel={t.back}
        />
      }
    />
  );
});
