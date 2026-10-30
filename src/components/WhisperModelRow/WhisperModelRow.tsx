import React, {useContext} from 'react';
import {View} from 'react-native';

import {observer} from 'mobx-react';
import {ProgressBar, Text} from 'react-native-paper';

import {useTheme} from '../../hooks';
import {asrStore} from '../../store';
import {L10nContext, formatBytes} from '../../utils';
import {asrTierLabel} from '../../utils/asrTierLabel';
import {t} from '../../locales';
import {
  ASR_DISK_HEADROOM_FACTOR,
  ASR_INSUFFICIENT_STORAGE,
  ASR_TIERS,
} from '../../services/asr';
import type {AsrTier} from '../../services/asr';

import {createStyles} from './styles';

const MB = 1024 * 1024;

interface WhisperModelRowProps {
  tier: AsrTier;
  testIDPrefix: string;
}

/** A Whisper tier's name, size and download status, for a setup sheet. */
export const WhisperModelRow: React.FC<WhisperModelRowProps> = observer(
  ({tier, testIDPrefix}) => {
    const theme = useTheme();
    const styles = createStyles({theme});
    const l10n = useContext(L10nContext);
    const strings = l10n.voiceMode;
    const bytes = ASR_TIERS[tier].estimatedBytes;
    const state = asrStore.downloadStates[tier];
    const lowDisk =
      state === 'error' &&
      asrStore.downloadError[tier] === ASR_INSUFFICIENT_STORAGE;

    const renderStatus = () => {
      if (state === 'ready') {
        return (
          <Text variant="bodySmall" style={styles.installed}>
            {strings.installedLabel}
          </Text>
        );
      }
      if (state === 'downloading') {
        return (
          <Text variant="bodySmall" style={styles.detail}>
            {t(strings.sttProgress, {
              done: formatBytes(bytes * asrStore.downloadProgress[tier], 0),
              total: formatBytes(bytes, 0),
            })}
          </Text>
        );
      }
      return null;
    };

    return (
      <View style={styles.row} testID={`${testIDPrefix}-stt`}>
        <View style={styles.rowHead}>
          <View style={styles.rowText}>
            <Text variant="titleSmall">{strings.sttRowTitle}</Text>
            <Text variant="bodySmall" style={styles.detail}>
              {t(strings.sttRowModel, {
                tier: asrTierLabel(tier, l10n),
                size: formatBytes(bytes, 0),
              })}
            </Text>
          </View>
          {renderStatus()}
        </View>
        {state === 'downloading' && (
          <ProgressBar
            progress={asrStore.downloadProgress[tier]}
            color={theme.colors.accent.greenStrong}
          />
        )}
        {lowDisk && (
          <Text
            variant="bodySmall"
            testID={`${testIDPrefix}-low-disk`}
            style={styles.error}>
            {t(l10n.voiceInput.insufficientStorage, {
              requiredMb: Math.ceil((bytes * ASR_DISK_HEADROOM_FACTOR) / MB),
              freeMb: Math.floor((asrStore.freeDiskBytes ?? 0) / MB),
            })}
          </Text>
        )}
        {state === 'error' && !lowDisk && (
          <Text variant="bodySmall" style={styles.error}>
            {strings.sttDownloadFailed}
          </Text>
        )}
      </View>
    );
  },
);
