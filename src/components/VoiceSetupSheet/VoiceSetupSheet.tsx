import React, {useContext, useEffect, useRef, useState} from 'react';
import {AppState, StyleSheet, View} from 'react-native';

import {observer} from 'mobx-react';
import {Button, ProgressBar, Text} from 'react-native-paper';

import {Sheet} from '../Sheet';
import {useTheme} from '../../hooks';
import {asrStore, ttsStore} from '../../store';
import {L10nContext, formatBytes} from '../../utils';
import {t} from '../../locales';
import {
  ASR_DISK_HEADROOM_FACTOR,
  ASR_INSUFFICIENT_STORAGE,
  ASR_TIERS,
} from '../../services/asr';
import {isVoiceModeVoice} from '../../services/voice';
import {
  ensureMicPermission,
  isMicGranted,
  openMicSettings,
  type MicPermissionResult,
} from '../../utils/asrMicPermission';

const MB = 1024 * 1024;
const BASE_BYTES = ASR_TIERS.base.estimatedBytes;
const baseReady = () => asrStore.downloadStates.base === 'ready';

interface VoiceSetupSheetProps {
  isVisible: boolean;
  onClose: () => void;
  /** Called once whisper base, a neural voice and the mic are all ready. */
  onDone: () => void;
}

/**
 * First-use setup for voice mode: the whisper base download, a neural
 * voice, then microphone access. Downloading base never changes the tier
 * dictation uses.
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

    const sttState = asrStore.downloadStates.base;
    const voice = ttsStore.currentVoice;
    const voiceReady = isVoiceModeVoice(voice);
    const lowDisk =
      sttState === 'error' &&
      asrStore.downloadError.base === ASR_INSUFFICIENT_STORAGE;

    const proceed = async () => {
      setBusy(true);
      try {
        if (!baseReady()) {
          await asrStore.downloadModel('base', {select: false});
          if (
            !baseReady() ||
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

    const renderSttStatus = () => {
      if (sttState === 'ready') {
        return (
          <Text variant="bodySmall" style={{color: theme.colors.statusLoaded}}>
            {strings.installedLabel}
          </Text>
        );
      }
      if (sttState === 'downloading') {
        return (
          <Text
            variant="bodySmall"
            style={{color: theme.colors.onSurfaceVariant}}>
            {t(strings.sttProgress, {
              done: formatBytes(BASE_BYTES * asrStore.downloadProgress.base, 0),
              total: formatBytes(BASE_BYTES, 0),
            })}
          </Text>
        );
      }
      return null;
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
            <View style={styles.row} testID="voice-setup-stt">
              <View style={styles.rowHead}>
                <View style={styles.rowText}>
                  <Text variant="titleSmall">{strings.sttRowTitle}</Text>
                  <Text
                    variant="bodySmall"
                    style={{color: theme.colors.onSurfaceVariant}}>
                    {t(strings.sttRowDetail, {
                      size: formatBytes(BASE_BYTES, 0),
                    })}
                  </Text>
                </View>
                {renderSttStatus()}
              </View>
              {sttState === 'downloading' && (
                <ProgressBar
                  progress={asrStore.downloadProgress.base}
                  color={theme.colors.accent.greenStrong}
                />
              )}
              {lowDisk && (
                <Text
                  variant="bodySmall"
                  testID="voice-setup-low-disk"
                  style={{color: theme.colors.error}}>
                  {t(l10n.voiceInput.insufficientStorage, {
                    requiredMb: Math.ceil(
                      (BASE_BYTES * ASR_DISK_HEADROOM_FACTOR) / MB,
                    ),
                    freeMb: Math.floor((asrStore.freeDiskBytes ?? 0) / MB),
                  })}
                </Text>
              )}
              {sttState === 'error' && !lowDisk && (
                <Text variant="bodySmall" style={{color: theme.colors.error}}>
                  {strings.sttDownloadFailed}
                </Text>
              )}
            </View>
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
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
});
