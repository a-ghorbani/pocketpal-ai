import React, {useContext} from 'react';
import {View} from 'react-native';
import {Button, Text, TouchableRipple} from 'react-native-paper';
import {observer} from 'mobx-react';

import {useTheme} from '../../hooks';
import {KITTEN_VOICES, TTS_PREVIEW_SAMPLE, getEngine} from '../../services/tts';
import type {Voice} from '../../services/tts';
import {ttsStore} from '../../store';
import {L10nContext} from '../../utils';

import {createStyles} from './styles';

/**
 * Kitten voices section of the TTS setup sheet. Mirrors the
 * Supertonic/Kokoro section state machine:
 * - `not_installed` — Install CTA card, voice rows disabled
 * - `downloading`   — color-fill progress card
 * - `ready`         — rows enabled & selectable, Preview works
 * - `error`         — error card with Retry button
 */
export const KittenSection: React.FC = observer(() => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const styles = createStyles(theme);

  const state = ttsStore.kittenDownloadState;
  const progress = ttsStore.kittenDownloadProgress;
  const isReady = state === 'ready';

  const selectedId =
    ttsStore.currentVoice?.engine === 'kitten'
      ? ttsStore.currentVoice.id
      : null;

  const handleInstall = () => {
    ttsStore.downloadKitten().catch(err => {
      console.warn('[KittenSection] download failed:', err);
    });
  };

  const handleRetry = () => {
    ttsStore.retryKittenDownload().catch(err => {
      console.warn('[KittenSection] retry failed:', err);
    });
  };

  const handleSelect = (voice: Voice) => {
    if (!isReady) {
      return;
    }
    ttsStore.setCurrentVoice({
      id: voice.id,
      name: voice.name,
      engine: 'kitten',
      language: voice.language,
    });
    ttsStore.closeSetupSheet();
  };

  const handlePreview = (voice: Voice) => {
    if (!isReady) {
      return;
    }
    getEngine('kitten')
      .play(TTS_PREVIEW_SAMPLE, voice)
      .catch(err => {
        console.warn('[KittenSection] preview failed:', err);
      });
  };

  const renderCard = () => {
    if (state === 'not_installed') {
      return (
        <View style={styles.installCard} testID="tts-kitten-install-cta">
          <View style={styles.installCardBody}>
            <Text style={styles.installCardTitle}>
              {l10n.voiceAndSpeech.kittenInstallCta}
            </Text>
            <Text style={styles.installCardSubtitle}>
              {l10n.voiceAndSpeech.kittenInstallDescription}
            </Text>
          </View>
          <Button
            mode="contained"
            compact
            onPress={handleInstall}
            testID="tts-kitten-install-button">
            {l10n.voiceAndSpeech.kittenInstallButton}
          </Button>
        </View>
      );
    }
    if (state === 'downloading') {
      const pct = Math.max(0, Math.min(1, progress));
      return (
        <View style={styles.installCard} testID="tts-kitten-downloading-card">
          <View
            style={[styles.installCardProgressFill, {width: `${pct * 100}%`}]}
            testID="tts-kitten-downloading-fill"
          />
          <View style={styles.installCardBody}>
            <Text style={styles.installCardTitle}>
              {l10n.voiceAndSpeech.kittenDownloadingLabel}
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
          testID="tts-kitten-error-card">
          <View style={styles.installCardBody}>
            <Text style={styles.installCardTitle}>
              {l10n.voiceAndSpeech.kittenDownloadError}
            </Text>
            {ttsStore.kittenDownloadError ? (
              <Text style={styles.installCardSubtitle}>
                {ttsStore.kittenDownloadError}
              </Text>
            ) : null}
          </View>
          <Button
            mode="contained"
            compact
            onPress={handleRetry}
            testID="tts-kitten-retry-button">
            {l10n.voiceAndSpeech.kittenRetryButton}
          </Button>
        </View>
      );
    }
    return null;
  };

  return (
    <View style={styles.section} testID="tts-kitten-section">
      <Text variant="titleMedium" style={styles.sectionHeader}>
        {l10n.voiceAndSpeech.kittenSectionTitle}
      </Text>
      <Text variant="bodyMedium" style={styles.sectionDescription}>
        {l10n.voiceAndSpeech.kittenSectionDescription}
      </Text>
      {renderCard()}
      {KITTEN_VOICES.map(voice => {
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
              testID={`tts-kitten-preview-${voice.id}`}
              onPress={() => handlePreview(voice)}>
              {l10n.voiceAndSpeech.previewButton}
            </Button>
          </View>
        );
        return isReady ? (
          <TouchableRipple
            key={voice.id}
            onPress={() => handleSelect(voice)}
            testID={`tts-kitten-voice-${voice.id}`}>
            {rowContent}
          </TouchableRipple>
        ) : (
          <View
            key={voice.id}
            testID={`tts-kitten-voice-${voice.id}`}
            accessibilityState={{disabled: true}}>
            {rowContent}
          </View>
        );
      })}
    </View>
  );
});
