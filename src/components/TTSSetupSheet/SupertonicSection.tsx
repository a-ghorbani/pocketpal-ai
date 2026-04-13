import React, {useContext} from 'react';
import {View} from 'react-native';
import {Button, Text, TouchableRipple} from 'react-native-paper';
import {observer} from 'mobx-react';

import {useTheme} from '../../hooks';
import {
  SUPERTONIC_VOICES,
  TTS_PREVIEW_SAMPLE,
  getEngine,
} from '../../services/tts';
import type {Voice} from '../../services/tts';
import {ttsStore} from '../../store';
import {L10nContext} from '../../utils';

import {createStyles} from './styles';

/**
 * Supertonic voices section of the TTS setup sheet.
 *
 * State-driven UI per `ttsStore.supertonicDownloadState`:
 * - `not_installed` — Install CTA card, voice rows visually disabled
 * - `downloading`   — color-fill progress card, rows still disabled
 * - `ready`         — no card, rows enabled & selectable, Preview works
 * - `error`         — error card with Retry button, rows disabled
 *
 * Pre-install Preview buttons are non-functional (bundled clips are
 * deferred to a v1b follow-up story per the v1.2 scope).
 */
export const SupertonicSection: React.FC = observer(() => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const styles = createStyles(theme);

  const state = ttsStore.supertonicDownloadState;
  const progress = ttsStore.supertonicDownloadProgress;
  const isReady = state === 'ready';

  const selectedId =
    ttsStore.currentVoice?.engine === 'supertonic'
      ? ttsStore.currentVoice.id
      : null;

  const handleInstall = () => {
    ttsStore.downloadSupertonic().catch(err => {
      console.warn('[SupertonicSection] download failed:', err);
    });
  };

  const handleRetry = () => {
    ttsStore.retryDownload().catch(err => {
      console.warn('[SupertonicSection] retry failed:', err);
    });
  };

  const handleSelect = (voice: Voice) => {
    if (!isReady) {
      return;
    }
    ttsStore.setCurrentVoice({
      id: voice.id,
      name: voice.name,
      engine: 'supertonic',
      language: voice.language,
    });
    ttsStore.closeSetupSheet();
  };

  const handlePreview = (voice: Voice) => {
    if (!isReady) {
      return;
    }
    getEngine('supertonic')
      .play(TTS_PREVIEW_SAMPLE, voice)
      .catch(err => {
        console.warn('[SupertonicSection] preview failed:', err);
      });
  };

  const renderCard = () => {
    if (state === 'not_installed') {
      return (
        <View style={styles.installCard} testID="tts-supertonic-install-cta">
          <View style={styles.installCardBody}>
            <Text style={styles.installCardTitle}>
              {l10n.voiceAndSpeech.supertonicInstallCta}
            </Text>
            <Text style={styles.installCardSubtitle}>
              {l10n.voiceAndSpeech.supertonicInstallDescription}
            </Text>
          </View>
          <Button
            mode="contained"
            compact
            onPress={handleInstall}
            testID="tts-supertonic-install-button">
            {l10n.voiceAndSpeech.supertonicInstallButton}
          </Button>
        </View>
      );
    }
    if (state === 'downloading') {
      const pct = Math.max(0, Math.min(1, progress));
      return (
        <View
          style={styles.installCard}
          testID="tts-supertonic-downloading-card">
          <View
            style={[styles.installCardProgressFill, {width: `${pct * 100}%`}]}
            testID="tts-supertonic-downloading-fill"
          />
          <View style={styles.installCardBody}>
            <Text style={styles.installCardTitle}>
              {l10n.voiceAndSpeech.supertonicDownloadingLabel}
            </Text>
            <Text style={styles.installCardSubtitle}>
              {Math.round(pct * 100)}%
            </Text>
          </View>
        </View>
      );
    }
    if (state === 'error') {
      return (
        <View
          style={[styles.installCard, styles.installCardError]}
          testID="tts-supertonic-error-card">
          <View style={styles.installCardBody}>
            <Text style={styles.installCardTitle}>
              {l10n.voiceAndSpeech.supertonicDownloadError}
            </Text>
            {ttsStore.supertonicDownloadError ? (
              <Text style={styles.installCardSubtitle}>
                {ttsStore.supertonicDownloadError}
              </Text>
            ) : null}
          </View>
          <Button
            mode="contained"
            compact
            onPress={handleRetry}
            testID="tts-supertonic-retry-button">
            {l10n.voiceAndSpeech.supertonicRetryButton}
          </Button>
        </View>
      );
    }
    // state === 'ready' → no card
    return null;
  };

  return (
    <View style={styles.section} testID="tts-supertonic-section">
      <Text variant="titleMedium" style={styles.sectionHeader}>
        {l10n.voiceAndSpeech.supertonicSectionTitle}
      </Text>
      <Text variant="bodyMedium" style={styles.sectionDescription}>
        {l10n.voiceAndSpeech.supertonicSectionDescription}
      </Text>
      {renderCard()}
      {SUPERTONIC_VOICES.map(voice => {
        const isSelected = voice.id === selectedId;
        const rowContent = (
          <View style={[styles.row, !isReady && styles.rowDisabled]}>
            <Text
              style={[
                styles.rowVoiceName,
                isSelected && styles.rowVoiceNameSelected,
              ]}>
              {voice.name}
            </Text>
            <Button
              mode="text"
              compact
              disabled={!isReady}
              style={styles.previewButton}
              testID={`tts-supertonic-preview-${voice.id}`}
              onPress={() => handlePreview(voice)}>
              {l10n.voiceAndSpeech.previewButton}
            </Button>
          </View>
        );
        return isReady ? (
          <TouchableRipple
            key={voice.id}
            onPress={() => handleSelect(voice)}
            testID={`tts-supertonic-voice-${voice.id}`}>
            {rowContent}
          </TouchableRipple>
        ) : (
          <View
            key={voice.id}
            testID={`tts-supertonic-voice-${voice.id}`}
            accessibilityState={{disabled: true}}>
            {rowContent}
          </View>
        );
      })}
    </View>
  );
});
