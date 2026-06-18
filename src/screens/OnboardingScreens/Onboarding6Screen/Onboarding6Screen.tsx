import React, {useEffect} from 'react';
import {Text, View} from 'react-native';
import {observer} from 'mobx-react';

import {uiStore} from '../../../store';
import {useTheme} from '../../../hooks';
import {
  entryId,
  resolvePalForTopic,
} from '../../../store/onboarding/onboardingPals';
import {OnboardingScaffold} from '../components/OnboardingScaffold';
import {OnboardingBottomBar} from '../components/OnboardingBottomBar';
import {ItalicAccentTitle} from '../components/ItalicAccentTitle';
import {DeviceInfoChip} from '../components/DeviceInfoChip';
import {ModelRadioGroup, type ModelOption} from '../components/ModelRadioGroup';
import {PipMascot} from '../illustrations/PipMascot';
import {useOnboardingHandlers} from '../useOnboardingHandlers';
import {createStyles} from './styles';

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
  const {l10n, goBack, finish, isFinishing} = useOnboardingHandlers(6);
  const theme = useTheme();
  const styles = createStyles(theme);
  const t = l10n.onboarding;
  const topic = uiStore.onboardingState.selectedTopic;
  const pal = resolvePalForTopic(topic);
  const selectedId = uiStore.onboardingState.selectedModelId;

  // Pre-select the Recommended (Balanced) tier on first arrival so the
  // Download CTA is enabled immediately. Re-seed when the topic (and
  // thus the pal) changes — the previously-picked model belongs to a
  // different pal's list and would otherwise leave the radio in an
  // unselectable state. User taps after that override the seed.
  useEffect(() => {
    const inPalList = pal.models.some(m => entryId(m) === selectedId);
    if (!inPalList) {
      const recommended = pal.models.find(m => m.recommended);
      if (recommended) {
        uiStore.setOnboardingModelId(entryId(recommended));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pal.key]);

  const canFinish = selectedId !== null && !isFinishing;
  const options: ModelOption[] = pal.models.map(entry => {
    const sizeSegment = formatSize(entry.sizeBytes);
    return {
      id: entryId(entry),
      title: t.screen6.modelTier[entry.tier],
      subtitle: sizeSegment
        ? `${entry.displayName} · ${sizeSegment}`
        : entry.displayName,
      recommended: entry.recommended,
    };
  });
  const pickedEntry = selectedId
    ? pal.models.find(m => entryId(m) === selectedId)
    : undefined;
  const sizeLabel = formatSize(pickedEntry?.sizeBytes);
  const palBody = t.screen6.pal[pal.key].body;
  const primaryLabel = sizeLabel
    ? t.screen6.ctaTemplate
        .replace('{{name}}', pal.name)
        .replace('{{size}}', sizeLabel)
    : t.screen6.cta.replace('{{name}}', pal.name);
  const subtitle = t.screen6.subtitleTemplate.replace('{{name}}', pal.name);
  return (
    <OnboardingScaffold
      step={6}
      layout="top"
      content={
        <>
          <View style={styles.header}>
            <PipMascot width={66} />
            <ItalicAccentTitle title={pal.name} align="center" />
            <Text style={styles.palBody}>{palBody}</Text>
          </View>
          <DeviceInfoChip
            ramSuffix={t.screen6.deviceRamSuffix}
            freeSuffix={t.screen6.deviceFreeSuffix}
          />
          <View style={styles.options}>
            <Text style={styles.subtitle}>{subtitle}</Text>
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
