/**
 * STTButton — microphone button for voice input.
 *
 * Mirrors VoiceChip's self-gating design:
 * - Reads sttStore for state
 * - Returns null when STT is disabled
 * - Toggles listening on press
 * - Shows animated state while listening
 */

import React from 'react';
import {View, Text, StyleSheet, ActivityIndicator} from 'react-native';
import {observer} from 'mobx-react';
import {IconButton, useTheme} from 'react-native-paper';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

import {sttStore} from '../../store';
import {dependencyStore} from '../../store';
import {useL10n} from '../../utils/l10n';

export const STTButton = observer(function STTButton() {
  const theme = useTheme();
  const l10n = useL10n();

  // Self-gate: return null when STT is disabled
  if (!sttStore.enabled) {
    return null;
  }

  const isListening = sttStore.isListening;
  const isError = sttStore.status === 'error';
  // Surface the graceful fallback to system speech recognition when the
  // Whisper native module is missing (no local transcription available).
  const whisperMissing = dependencyStore.status.whisperNative === 'missing';

  const handlePress = () => {
    ReactNativeHapticFeedback.trigger('impactLight');
    sttStore.toggleListening();
  };

  const iconName = isListening ? 'stop-circle-outline' : 'microphone-outline';
  const iconColor = isError
    ? theme.colors.error
    : isListening
      ? theme.colors.primary
      : theme.colors.onSurfaceVariant;

  return (
    <View style={styles.container}>
      <IconButton
        testID="stt-button"
        icon={iconName}
        iconColor={iconColor}
        size={24}
        onPress={handlePress}
        accessible
        accessibilityLabel={
          isListening
            ? l10n.components.chatInput.stt.stopListening
            : l10n.components.chatInput.stt.startListening
        }
      />
      {isListening && (
        <ActivityIndicator
          size="small"
          color={theme.colors.primary}
          style={styles.indicator}
        />
      )}
      {whisperMissing && (
        <Text
          testID="stt-system-fallback-hint"
          style={styles.fallbackHint}
          numberOfLines={1}>
          系统语音识别
        </Text>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  indicator: {
    position: 'absolute',
    right: 4,
    top: 4,
  },
  fallbackHint: {
    fontSize: 10,
    color: theme.colors.onSurfaceVariant,
    opacity: 0.75,
    marginLeft: 2,
  },
});
