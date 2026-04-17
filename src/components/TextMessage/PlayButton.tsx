import React, {useContext} from 'react';
import {Pressable} from 'react-native';
import {observer} from 'mobx-react';

import {useTheme} from '../../hooks';
import {modelStore, ttsStore} from '../../store';
import {L10nContext} from '../../utils';
import {assistant} from '../../utils/chat';
import {PlayIcon, StopIcon} from '../../assets/icons';
import type {MessageType} from '../../utils/types';

const countWords = (text: string): number => {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return 0;
  }
  return trimmed.split(/\s+/).length;
};

interface PlayButtonProps {
  message: MessageType.Any;
}

/**
 * Per-message replay button. Self-gates: returns null when TTS is
 * unavailable, message is not assistant text, still streaming, etc.
 *
 * Designed to sit in the Bubble footer row alongside copy/timings.
 */
export const PlayButton: React.FC<PlayButtonProps> = observer(({message}) => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);

  if (!ttsStore.isTTSAvailable) {
    return null;
  }

  if (message.type !== 'text') {
    return null;
  }

  if (message.author?.id !== assistant.id) {
    return null;
  }

  if (countWords(message.text) <= 1) {
    return null;
  }

  const hasFinalResult = !!message.metadata?.completionResult;
  if (!hasFinalResult && modelStore.isStreaming) {
    return null;
  }

  const playbackState = ttsStore.playbackState;
  const isThisPlaying =
    (playbackState.mode === 'playing' || playbackState.mode === 'streaming') &&
    playbackState.messageId === message.id;

  const handlePress = () => {
    if (isThisPlaying) {
      ttsStore.stop().catch(() => {});
      return;
    }
    if (ttsStore.currentVoice == null) {
      ttsStore.openSetupSheet();
      return;
    }
    const hadReasoning =
      !!message.metadata?.completionResult?.reasoning_content?.trim();
    ttsStore.play(message.id, message.text, {hadReasoning}).catch(() => {});
  };

  const iconSize = 16;

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={
        isThisPlaying
          ? l10n.voiceAndSpeech.stopMessageLabel
          : l10n.voiceAndSpeech.playMessageLabel
      }
      testID={`playbutton-${message.id}`}>
      {isThisPlaying ? (
        <StopIcon
          width={iconSize}
          height={iconSize}
          stroke={theme.colors.onSurfaceVariant}
        />
      ) : (
        <PlayIcon
          width={iconSize}
          height={iconSize}
          stroke={theme.colors.onSurfaceVariant}
        />
      )}
    </Pressable>
  );
});
