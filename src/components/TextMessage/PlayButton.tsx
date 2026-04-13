import React, {useContext} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {Icon} from 'react-native-paper';
import {observer} from 'mobx-react';

import {useTheme} from '../../hooks';
import {modelStore, ttsStore} from '../../store';
import {L10nContext} from '../../utils';
import {assistant} from '../../utils/chat';
import type {MessageType} from '../../utils/types';

const MIN_TAP = 44;

const styles = StyleSheet.create({
  container: {
    width: MIN_TAP,
    height: MIN_TAP,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const countWords = (text: string): number => {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return 0;
  }
  return trimmed.split(/\s+/).length;
};

interface PlayButtonProps {
  message: MessageType.DerivedText;
}

/**
 * Per-message replay button. Rendered only when:
 *  - `ttsStore.isTTSAvailable` is true (memory gate)
 *  - the message is from the assistant
 *  - the text has more than one word (skip single-word / emoji-only)
 *  - streaming has finished (i.e. `completionResult` metadata present
 *    OR model is not currently streaming)
 *
 * First tap with no voice chosen opens the setup sheet. With a voice
 * chosen, taps toggle between play and stop for this message.
 */
export const PlayButton: React.FC<PlayButtonProps> = observer(({message}) => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);

  if (!ttsStore.isTTSAvailable) {
    return null;
  }

  if (message.author?.id !== assistant.id) {
    return null;
  }

  if (countWords(message.text) <= 1) {
    return null;
  }

  // Streaming guard: hide until the final completion metadata lands. If
  // that metadata is missing (older messages), fall back to the global
  // streaming flag.
  const hasFinalResult = !!message.metadata?.completionResult;
  if (!hasFinalResult && modelStore.isStreaming) {
    return null;
  }

  const playbackState = ttsStore.playbackState;
  const isThisPlaying =
    (playbackState.mode === 'playing' || playbackState.mode === 'streaming') &&
    playbackState.messageId === message.id;

  const handlePress = () => {
    if (ttsStore.currentVoice == null) {
      ttsStore.openSetupSheet();
      return;
    }
    if (isThisPlaying) {
      ttsStore.stop().catch(() => {
        /* logged inside store */
      });
      return;
    }
    ttsStore.play(message.id, message.text).catch(() => {
      /* logged inside store */
    });
  };

  return (
    <View style={styles.container}>
      <Pressable
        onPress={handlePress}
        style={styles.container}
        accessibilityRole="button"
        accessibilityLabel={
          isThisPlaying
            ? l10n.voiceAndSpeech.stopMessageLabel
            : l10n.voiceAndSpeech.playMessageLabel
        }
        testID={`playbutton-${message.id}`}>
        <Icon
          source={isThisPlaying ? 'stop' : 'volume-high'}
          size={20}
          color={theme.colors.onSurfaceVariant}
        />
      </Pressable>
    </View>
  );
});
