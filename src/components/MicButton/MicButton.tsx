import React, {useContext} from 'react';
import {Pressable} from 'react-native';

import {observer} from 'mobx-react';
import {useNavigation} from '@react-navigation/native';
import type {DrawerNavigationProp} from '@react-navigation/drawer';

import {useTheme} from '../../hooks';
import {usePushToTalk} from '../../hooks/usePushToTalk';
import {asrStore} from '../../store';
import {L10nContext} from '../../utils';
import {ROUTES} from '../../utils/navigationConstants';
import type {RootDrawerParamList} from '../../utils/types';
import {MicrophoneIcon} from '../../assets/icons';

import {createStyles} from './styles';

interface MicButtonProps {
  /** Append the transcript to the composer (never auto-send). */
  appendTranscript: (text: string) => void;
}

/**
 * Push-to-talk mic button in the composer right-controls.
 *
 * Self-gates: renders `null` when the ASR availability gate is closed. When
 * the gate is open but the selected tier is not installed, a press routes to
 * the Settings voice-input surface instead of recording. When ready, hold to
 * record / release to transcribe via `usePushToTalk`; the transcript is
 * appended to the composer.
 */
export const MicButton: React.FC<MicButtonProps> = observer(
  ({appendTranscript}) => {
    const theme = useTheme();
    const l10n = useContext(L10nContext);
    const styles = createStyles(theme);
    const navigation =
      useNavigation<DrawerNavigationProp<RootDrawerParamList>>();

    const available = asrStore.asrAvailable;
    const ready = asrStore.isSelectedTierReady;
    const captureState = asrStore.captureState;

    const {onPressIn, onPressOut} = usePushToTalk({
      onTranscript: appendTranscript,
    });

    if (!available) {
      return null;
    }

    const isRecording = captureState === 'recording';
    const isTranscribing = captureState === 'transcribing';

    const handleSetupPress = () => {
      navigation.navigate(ROUTES.SETTINGS);
    };

    const accessibilityLabel = !ready
      ? l10n.voiceInput.setupLabel
      : isRecording
        ? l10n.voiceInput.recordingLabel
        : isTranscribing
          ? l10n.voiceInput.transcribingLabel
          : l10n.voiceInput.micLabel;

    const iconColor = isRecording
      ? theme.colors.primary
      : theme.colors.onSurfaceVariant;

    // Gate-open but not installed → route to setup, do not record.
    if (!ready) {
      return (
        <Pressable
          style={styles.button}
          onPress={handleSetupPress}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          testID="mic-button-setup">
          <MicrophoneIcon
            width={18}
            height={18}
            stroke={theme.colors.onSurfaceVariant}
          />
        </Pressable>
      );
    }

    return (
      <Pressable
        style={[styles.button, isRecording && styles.buttonRecording]}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={isTranscribing}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{busy: isTranscribing, selected: isRecording}}
        testID="mic-button">
        <MicrophoneIcon width={18} height={18} stroke={iconColor} />
      </Pressable>
    );
  },
);
