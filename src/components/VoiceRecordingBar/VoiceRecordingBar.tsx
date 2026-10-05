import React, {useContext} from 'react';
import {ActivityIndicator, Pressable, View} from 'react-native';

import {observer} from 'mobx-react';
import {Text} from 'react-native-paper';

import {useTheme} from '../../hooks';
import {asrStore} from '../../store';
import {L10nContext} from '../../utils';
import {ASR_LEVEL_HISTORY} from '../../services/asr';
import {XIcon} from '../../assets/icons';

import {BAR_MIN_HEIGHT, BAR_RANGE, createStyles} from './styles';

interface VoiceRecordingBarProps {
  onCancel: () => void;
  onStop: () => void;
}

const LevelBars: React.FC<{
  styles: ReturnType<typeof createStyles>;
  label: string;
}> = observer(({styles, label}) => {
  const levels = asrStore.inputLevels;
  const padding = ASR_LEVEL_HISTORY - levels.length;
  return (
    <View
      style={styles.bars}
      accessible
      accessibilityLabel={label}
      testID="voice-level-bars">
      {Array.from({length: ASR_LEVEL_HISTORY}, (_, i) => {
        const level = i < padding ? 0 : levels[i - padding]!;
        return (
          <View
            key={i}
            style={[styles.bar, {height: BAR_MIN_HEIGHT + level * BAR_RANGE}]}
          />
        );
      })}
    </View>
  );
});

/**
 * Replaces the composer's control row while a voice capture is recording or
 * being transcribed: cancel, a live input-level waveform (or a transcribing
 * label), and stop.
 */
export const VoiceRecordingBar: React.FC<VoiceRecordingBarProps> = observer(
  ({onCancel, onStop}) => {
    const theme = useTheme();
    const l10n = useContext(L10nContext);
    const styles = createStyles(theme);
    const isTranscribing = asrStore.captureState === 'transcribing';

    return (
      <View style={styles.container} testID="voice-recording-bar">
        <Pressable
          style={styles.circleButton}
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel={l10n.voiceInput.cancelLabel}
          testID="voice-cancel-button">
          <XIcon width={18} height={18} stroke={theme.colors.onSurface} />
        </Pressable>

        {isTranscribing ? (
          <Text
            variant="bodyMedium"
            style={styles.transcribingText}
            accessibilityLiveRegion="polite"
            testID="voice-transcribing">
            {l10n.voiceInput.transcribingLabel}
          </Text>
        ) : (
          <LevelBars styles={styles} label={l10n.voiceInput.recordingLabel} />
        )}

        {isTranscribing ? (
          <View style={styles.circleButton}>
            <ActivityIndicator size="small" color={theme.colors.onSurface} />
          </View>
        ) : (
          <Pressable
            style={styles.circleButton}
            onPress={onStop}
            accessibilityRole="button"
            accessibilityLabel={l10n.voiceInput.stopLabel}
            testID="voice-stop-button">
            <View style={styles.stopSquare} />
          </Pressable>
        )}
      </View>
    );
  },
);
