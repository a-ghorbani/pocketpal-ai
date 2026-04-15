import React, {useContext} from 'react';
import {View} from 'react-native';
import {Button, Text} from 'react-native-paper';
import {observer} from 'mobx-react';

import {useTheme} from '../../hooks';
import type {EngineId} from '../../services/tts';
import {ttsStore} from '../../store';
import {L10nContext} from '../../utils';

import {createStyles} from './styles';

type NeuralEngineId = Exclude<EngineId, 'system'>;

type DownloadState = 'not_installed' | 'downloading' | 'ready' | 'error';

interface EngineBindings {
  state: DownloadState;
  progress: number;
  error: string | null;
  titleKey:
    | 'kittenSectionTitle'
    | 'kokoroSectionTitle'
    | 'supertonicSectionTitle';
  descriptionKey:
    | 'kittenSectionDescription'
    | 'kokoroSectionDescription'
    | 'supertonicSectionDescription';
  installCtaKey:
    | 'kittenInstallCta'
    | 'kokoroInstallCta'
    | 'supertonicInstallCta';
  installDescriptionKey:
    | 'kittenInstallDescription'
    | 'kokoroInstallDescription'
    | 'supertonicInstallDescription';
  installButtonKey:
    | 'kittenInstallButton'
    | 'kokoroInstallButton'
    | 'supertonicInstallButton';
  downloadingLabelKey:
    | 'kittenDownloadingLabel'
    | 'kokoroDownloadingLabel'
    | 'supertonicDownloadingLabel';
  downloadErrorKey:
    | 'kittenDownloadError'
    | 'kokoroDownloadError'
    | 'supertonicDownloadError';
  retryButtonKey:
    | 'kittenRetryButton'
    | 'kokoroRetryButton'
    | 'supertonicRetryButton';
  download: () => Promise<void>;
  retry: () => Promise<void>;
  delete: () => Promise<void>;
}

const readNeuralBindings = (engineId: NeuralEngineId): EngineBindings => {
  switch (engineId) {
    case 'kitten':
      return {
        state: ttsStore.kittenDownloadState,
        progress: ttsStore.kittenDownloadProgress,
        error: ttsStore.kittenDownloadError,
        titleKey: 'kittenSectionTitle',
        descriptionKey: 'kittenSectionDescription',
        installCtaKey: 'kittenInstallCta',
        installDescriptionKey: 'kittenInstallDescription',
        installButtonKey: 'kittenInstallButton',
        downloadingLabelKey: 'kittenDownloadingLabel',
        downloadErrorKey: 'kittenDownloadError',
        retryButtonKey: 'kittenRetryButton',
        download: () => ttsStore.downloadKitten(),
        retry: () => ttsStore.retryKittenDownload(),
        delete: () => ttsStore.deleteKitten(),
      };
    case 'kokoro':
      return {
        state: ttsStore.kokoroDownloadState,
        progress: ttsStore.kokoroDownloadProgress,
        error: ttsStore.kokoroDownloadError,
        titleKey: 'kokoroSectionTitle',
        descriptionKey: 'kokoroSectionDescription',
        installCtaKey: 'kokoroInstallCta',
        installDescriptionKey: 'kokoroInstallDescription',
        installButtonKey: 'kokoroInstallButton',
        downloadingLabelKey: 'kokoroDownloadingLabel',
        downloadErrorKey: 'kokoroDownloadError',
        retryButtonKey: 'kokoroRetryButton',
        download: () => ttsStore.downloadKokoro(),
        retry: () => ttsStore.retryKokoroDownload(),
        delete: () => ttsStore.deleteKokoro(),
      };
    case 'supertonic':
      return {
        state: ttsStore.supertonicDownloadState,
        progress: ttsStore.supertonicDownloadProgress,
        error: ttsStore.supertonicDownloadError,
        titleKey: 'supertonicSectionTitle',
        descriptionKey: 'supertonicSectionDescription',
        installCtaKey: 'supertonicInstallCta',
        installDescriptionKey: 'supertonicInstallDescription',
        installButtonKey: 'supertonicInstallButton',
        downloadingLabelKey: 'supertonicDownloadingLabel',
        downloadErrorKey: 'supertonicDownloadError',
        retryButtonKey: 'supertonicRetryButton',
        download: () => ttsStore.downloadSupertonic(),
        retry: () => ttsStore.retryDownload(),
        delete: () => ttsStore.deleteSupertonic(),
      };
  }
};

interface EngineRowProps {
  engineId: EngineId;
}

/**
 * Per-engine install/download/ready/error card used in the Manage engines
 * view. Collapses the four near-identical section components (Kitten /
 * Kokoro / Supertonic / System) into a single state-driven control.
 *
 * System is always ready and shows an "always available" label with no
 * action — neural engines run the full state machine.
 */
export const EngineRow: React.FC<EngineRowProps> = observer(({engineId}) => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const styles = createStyles(theme);

  if (engineId === 'system') {
    return (
      <View style={styles.engineRowWrap} testID="tts-engine-row-system">
        <Text style={styles.engineRowHeader}>
          {l10n.voiceAndSpeech.engineChipSystem}
        </Text>
        <Text style={styles.engineRowSubline}>
          {l10n.voiceAndSpeech.systemAlwaysAvailable}
        </Text>
      </View>
    );
  }

  const bindings = readNeuralBindings(engineId);

  const handleInstall = () => {
    bindings.download().catch(err => {
      console.warn(`[EngineRow:${engineId}] download failed:`, err);
    });
  };

  const handleRetry = () => {
    bindings.retry().catch(err => {
      console.warn(`[EngineRow:${engineId}] retry failed:`, err);
    });
  };

  const handleDelete = () => {
    bindings.delete().catch(err => {
      console.warn(`[EngineRow:${engineId}] delete failed:`, err);
    });
  };

  const renderCard = () => {
    if (bindings.state === 'not_installed') {
      return (
        <View style={styles.installCard} testID={`tts-${engineId}-install-cta`}>
          <View style={styles.installCardBody}>
            <Text style={styles.installCardTitle}>
              {l10n.voiceAndSpeech[bindings.installCtaKey]}
            </Text>
            <Text style={styles.installCardSubtitle}>
              {l10n.voiceAndSpeech[bindings.installDescriptionKey]}
            </Text>
          </View>
          <Button
            mode="contained"
            compact
            onPress={handleInstall}
            testID={`tts-${engineId}-install-button`}>
            {l10n.voiceAndSpeech[bindings.installButtonKey]}
          </Button>
        </View>
      );
    }
    if (bindings.state === 'downloading') {
      const pct = Math.max(0, Math.min(1, bindings.progress));
      return (
        <View
          style={styles.installCard}
          testID={`tts-${engineId}-downloading-card`}>
          <View
            style={[styles.installCardProgressFill, {width: `${pct * 100}%`}]}
            testID={`tts-${engineId}-downloading-fill`}
          />
          <View style={styles.installCardBody}>
            <Text style={styles.installCardTitle}>
              {l10n.voiceAndSpeech[bindings.downloadingLabelKey]}
            </Text>
            <Text style={styles.installCardSubtitle}>
              {Math.round(pct * 100)}%
            </Text>
          </View>
        </View>
      );
    }
    if (bindings.state === 'error') {
      return (
        <View
          style={[styles.installCard, styles.installCardError]}
          testID={`tts-${engineId}-error-card`}>
          <View style={styles.installCardBody}>
            <Text style={styles.installCardTitle}>
              {l10n.voiceAndSpeech[bindings.downloadErrorKey]}
            </Text>
            {bindings.error ? (
              <Text style={styles.installCardSubtitle}>{bindings.error}</Text>
            ) : null}
          </View>
          <Button
            mode="contained"
            compact
            onPress={handleRetry}
            testID={`tts-${engineId}-retry-button`}>
            {l10n.voiceAndSpeech[bindings.retryButtonKey]}
          </Button>
        </View>
      );
    }
    // ready — no card, show delete button below header
    return null;
  };

  return (
    <View style={styles.engineRowWrap} testID={`tts-engine-row-${engineId}`}>
      <Text style={styles.engineRowHeader}>
        {l10n.voiceAndSpeech[bindings.titleKey]}
      </Text>
      <Text style={styles.engineRowSubline}>
        {l10n.voiceAndSpeech[bindings.descriptionKey]}
      </Text>
      {renderCard()}
      {bindings.state === 'ready' ? (
        <Button
          mode="outlined"
          compact
          onPress={handleDelete}
          style={styles.deleteButton}
          testID={`tts-${engineId}-delete-button`}>
          {l10n.voiceAndSpeech.deleteButton}
        </Button>
      ) : null}
    </View>
  );
});
