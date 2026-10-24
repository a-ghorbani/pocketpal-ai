import React, {useContext, useEffect, useRef, useState} from 'react';
import {AppState, StyleSheet, View} from 'react-native';

import {observer} from 'mobx-react';
import {Button, Text} from 'react-native-paper';

import {Sheet} from '../Sheet';
import {WhisperModelRow} from '../WhisperModelRow';
import {useTheme} from '../../hooks';
import {asrStore, ttsStore} from '../../store';
import {L10nContext} from '../../utils';
import {t} from '../../locales';
import {isVoiceModeVoice} from '../../services/voice';
import {
  ensureMicPermission,
  isMicGranted,
  openMicSettings,
  type MicPermissionResult,
} from '../../utils/asrMicPermission';

interface VoiceSetupSheetProps {
  isVisible: boolean;
  onClose: () => void;
  /** Called once whisper, a neural voice and the mic are all ready. */
  onDone: () => void;
}

/**
 * First-use setup for voice mode: the in-use whisper tier (the default when
 * none is installed), a neural voice, then microphone access.
 */
export const VoiceSetupSheet: React.FC<VoiceSetupSheetProps> = observer(
  ({isVisible, onClose, onDone}) => {
    const theme = useTheme();
    const l10n = useContext(L10nContext);
    const strings = l10n.voiceMode;
    const [mic, setMic] = useState<MicPermissionResult | null>(null);
    const [busy, setBusy] = useState(false);
    const visible = useRef(isVisible);
    visible.current = isVisible;

    useEffect(() => {
      if (!isVisible) {
        return;
      }
      let active = true;
      const recheckMic = async () => {
        if ((await isMicGranted()) && active) {
          setMic('granted');
        }
      };
      recheckMic();
      const subscription = AppState.addEventListener('change', state => {
        if (state === 'active') {
          recheckMic();
        }
      });
      return () => {
        active = false;
        subscription.remove();
      };
    }, [isVisible]);

    const sttState = asrStore.downloadStates[asrStore.setupTier];
    const voice = ttsStore.currentVoice;
    const voiceReady = isVoiceModeVoice(voice);

    const proceed = async () => {
      setBusy(true);
      try {
        if (!asrStore.isSelectedTierReady) {
          await asrStore.downloadModel(asrStore.setupTier);
          if (
            !asrStore.isSelectedTierReady ||
            !visible.current ||
            AppState.currentState === 'background'
          ) {
            return;
          }
        }
        const result = await ensureMicPermission();
        setMic(result);
        if (result === 'granted' && visible.current) {
          onDone();
        }
      } finally {
        setBusy(false);
      }
    };

    const renderPrimary = () => {
      if (!voiceReady) {
        return (
          <Button
            mode="contained"
            testID="voice-setup-choose-voice"
            onPress={() => ttsStore.openSetupSheet()}>
            {strings.chooseVoiceCta}
          </Button>
        );
      }
      if (mic === 'blocked') {
        return (
          <Button
            mode="contained"
            testID="voice-setup-open-settings"
            onPress={() => openMicSettings()}>
            {l10n.voiceInput.openSettingsLabel}
          </Button>
        );
      }
      const downloading = sttState === 'downloading';
      return (
        <Button
          mode="contained"
          testID="voice-setup-continue"
          disabled={busy || downloading}
          onPress={proceed}>
          {downloading ? l10n.voiceInput.downloadingLabel : strings.continueCta}
        </Button>
      );
    };

    const micText =
      mic === 'blocked'
        ? l10n.voiceInput.errorPermissionBlocked
        : mic === 'denied'
          ? strings.micDenied
          : strings.micNote;

    return (
      <Sheet
        isVisible={isVisible}
        onClose={onClose}
        title={strings.setupTitle}
        snapPoints={['70%']}>
        <Sheet.ScrollView
          contentContainerStyle={styles.content}
          testID="voice-setup-sheet">
          <Text
            variant="bodyMedium"
            style={{color: theme.colors.onSurfaceVariant}}>
            {strings.setupBody}
          </Text>

          <View
            style={[styles.card, {borderColor: theme.colors.outlineVariant}]}>
            <WhisperModelRow
              tier={asrStore.setupTier}
              testIDPrefix="voice-setup"
            />
            <View
              style={[styles.divider, {backgroundColor: theme.colors.border}]}
            />
            <View style={styles.row} testID="voice-setup-voice">
              <View style={styles.rowText}>
                <Text variant="titleSmall">{strings.voiceRowTitle}</Text>
                <Text
                  variant="bodySmall"
                  style={{color: theme.colors.onSurfaceVariant}}>
                  {voiceReady
                    ? t(strings.voiceRowReady, {voice: voice.name})
                    : strings.voiceRowMissing}
                </Text>
              </View>
            </View>
          </View>

          <Text
            variant="bodySmall"
            testID="voice-setup-mic"
            style={{
              color:
                mic && mic !== 'granted'
                  ? theme.colors.error
                  : theme.colors.onSurfaceVariant,
            }}>
            {micText}
          </Text>

          {renderPrimary()}
          <Button mode="text" onPress={onClose} testID="voice-setup-cancel">
            {l10n.common.cancel}
          </Button>
        </Sheet.ScrollView>
      </Sheet>
    );
  },
);

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    gap: 16,
  },
  card: {
    borderWidth: 1,
    borderRadius: 18,
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
});
