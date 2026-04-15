import React, {useContext, useMemo} from 'react';
import {View} from 'react-native';
import {Button, Text, TouchableRipple} from 'react-native-paper';
import {observer} from 'mobx-react';

import {useTheme} from '../../hooks';
import {KOKORO_VOICES, TTS_PREVIEW_SAMPLE, getEngine} from '../../services/tts';
import type {Voice} from '../../services/tts';
import {ttsStore} from '../../store';
import {L10nContext} from '../../utils';

import {createStyles} from './styles';

/**
 * Kokoro voices section of the TTS setup sheet.
 *
 * v1b scope: filters the 28-voice catalog down to English voices only
 * (language starts with 'en'). Full multilingual switching is the
 * v1b-TTS-language follow-up.
 */
export const KokoroSection: React.FC = observer(() => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const styles = createStyles(theme);

  const state = ttsStore.kokoroDownloadState;
  const progress = ttsStore.kokoroDownloadProgress;
  const isReady = state === 'ready';

  // TODO(v1b-TTS-language): drop the filter once the language picker ships.
  const visibleVoices = useMemo(
    () => KOKORO_VOICES.filter(v => v.language?.startsWith('en') ?? false),
    [],
  );

  const selectedId =
    ttsStore.currentVoice?.engine === 'kokoro'
      ? ttsStore.currentVoice.id
      : null;

  const handleInstall = () => {
    ttsStore.downloadKokoro().catch(err => {
      console.warn('[KokoroSection] download failed:', err);
    });
  };

  const handleRetry = () => {
    ttsStore.retryKokoroDownload().catch(err => {
      console.warn('[KokoroSection] retry failed:', err);
    });
  };

  const handleSelect = (voice: Voice) => {
    if (!isReady) {
      return;
    }
    ttsStore.setCurrentVoice({
      id: voice.id,
      name: voice.name,
      engine: 'kokoro',
      language: voice.language,
    });
    ttsStore.closeSetupSheet();
  };

  const handlePreview = (voice: Voice) => {
    if (!isReady) {
      return;
    }
    getEngine('kokoro')
      .play(TTS_PREVIEW_SAMPLE, voice)
      .catch(err => {
        console.warn('[KokoroSection] preview failed:', err);
      });
  };

  const renderCard = () => {
    if (state === 'not_installed') {
      return (
        <View style={styles.installCard} testID="tts-kokoro-install-cta">
          <View style={styles.installCardBody}>
            <Text style={styles.installCardTitle}>
              {l10n.voiceAndSpeech.kokoroInstallCta}
            </Text>
            <Text style={styles.installCardSubtitle}>
              {l10n.voiceAndSpeech.kokoroInstallDescription}
            </Text>
          </View>
          <Button
            mode="contained"
            compact
            onPress={handleInstall}
            testID="tts-kokoro-install-button">
            {l10n.voiceAndSpeech.kokoroInstallButton}
          </Button>
        </View>
      );
    }
    if (state === 'downloading') {
      const pct = Math.max(0, Math.min(1, progress));
      return (
        <View style={styles.installCard} testID="tts-kokoro-downloading-card">
          <View
            style={[styles.installCardProgressFill, {width: `${pct * 100}%`}]}
            testID="tts-kokoro-downloading-fill"
          />
          <View style={styles.installCardBody}>
            <Text style={styles.installCardTitle}>
              {l10n.voiceAndSpeech.kokoroDownloadingLabel}
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
          testID="tts-kokoro-error-card">
          <View style={styles.installCardBody}>
            <Text style={styles.installCardTitle}>
              {l10n.voiceAndSpeech.kokoroDownloadError}
            </Text>
            {ttsStore.kokoroDownloadError ? (
              <Text style={styles.installCardSubtitle}>
                {ttsStore.kokoroDownloadError}
              </Text>
            ) : null}
          </View>
          <Button
            mode="contained"
            compact
            onPress={handleRetry}
            testID="tts-kokoro-retry-button">
            {l10n.voiceAndSpeech.kokoroRetryButton}
          </Button>
        </View>
      );
    }
    return null;
  };

  return (
    <View style={styles.section} testID="tts-kokoro-section">
      <Text variant="titleMedium" style={styles.sectionHeader}>
        {l10n.voiceAndSpeech.kokoroSectionTitle}
      </Text>
      <Text variant="bodyMedium" style={styles.sectionDescription}>
        {l10n.voiceAndSpeech.kokoroSectionDescription}
      </Text>
      {renderCard()}
      {visibleVoices.map(voice => {
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
              testID={`tts-kokoro-preview-${voice.id}`}
              onPress={() => handlePreview(voice)}>
              {l10n.voiceAndSpeech.previewButton}
            </Button>
          </View>
        );
        return isReady ? (
          <TouchableRipple
            key={voice.id}
            onPress={() => handleSelect(voice)}
            testID={`tts-kokoro-voice-${voice.id}`}>
            {rowContent}
          </TouchableRipple>
        ) : (
          <View
            key={voice.id}
            testID={`tts-kokoro-voice-${voice.id}`}
            accessibilityState={{disabled: true}}>
            {rowContent}
          </View>
        );
      })}
    </View>
  );
});
