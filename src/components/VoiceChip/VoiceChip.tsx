import React, {useContext, useMemo, useState} from 'react';
import {LayoutChangeEvent, Pressable, View} from 'react-native';
import {Text} from 'react-native-paper';
import {observer} from 'mobx-react';

import {useTheme} from '../../hooks';
import {ttsStore} from '../../store';
import {L10nContext} from '../../utils';
import {
  SettingsIcon,
  VolumeOffIcon,
  VolumeOnIcon,
  WavesIcon,
} from '../../assets/icons';

import {createStyles} from './styles';

// Responsive truncation: below FULL_WIDTH show first 3 chars; below
// SHORT_WIDTH show icon only. Kept simple — no onLayout-driven
// multi-step measure loop.
const FULL_WIDTH = 110;
const SHORT_WIDTH = 72;

const truncateName = (name: string, width: number): string | null => {
  if (width >= FULL_WIDTH) {
    return name;
  }
  if (width >= SHORT_WIDTH) {
    return name.slice(0, 3);
  }
  return null;
};

const pickSpeakerIcon = (autoSpeakEnabled: boolean, isPlaying: boolean) => {
  if (isPlaying) {
    return WavesIcon;
  }
  return autoSpeakEnabled ? VolumeOnIcon : VolumeOffIcon;
};

/**
 * Input-bar split chip. Two visual forms:
 *  - Pre-setup (`currentVoice == null`): single gear circle.
 *  - Voice-chosen: split with left half (toggle auto-speak + voice name)
 *    and right half (gear → setup sheet), separated by 1px divider.
 *
 * Visual states on the left half: OFF, ON-idle, ON-playing. Voice name
 * truncates as the chip narrows: full → 3 chars → icon only.
 */
export const VoiceChip: React.FC = observer(() => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const styles = createStyles(theme);

  const [leftWidth, setLeftWidth] = useState<number>(FULL_WIDTH);

  const isAvailable = ttsStore.isTTSAvailable;
  const currentVoice = ttsStore.currentVoice;
  const autoSpeakEnabled = ttsStore.autoSpeakEnabled;
  const playbackState = ttsStore.playbackState;
  const isPlaying =
    playbackState.mode === 'playing' || playbackState.mode === 'streaming';

  const handleOpenSettings = () => {
    ttsStore.openSetupSheet();
  };

  const handleToggleAutoSpeak = () => {
    ttsStore.setAutoSpeak(!autoSpeakEnabled);
  };

  const onLeftLayout = (e: LayoutChangeEvent) => {
    setLeftWidth(e.nativeEvent.layout.width);
  };

  const label = useMemo(() => {
    if (!currentVoice) {
      return null;
    }
    return truncateName(currentVoice.name, leftWidth);
  }, [currentVoice, leftWidth]);

  if (!isAvailable) {
    return null;
  }

  if (!currentVoice) {
    return (
      <Pressable
        style={styles.gearOnly}
        onPress={handleOpenSettings}
        accessibilityRole="button"
        accessibilityLabel={l10n.voiceAndSpeech.openSettingsLabel}
        testID="voicechip-gear-only">
        <SettingsIcon
          width={20}
          height={20}
          stroke={theme.colors.onSurfaceVariant}
        />
      </Pressable>
    );
  }

  const SpeakerIcon = pickSpeakerIcon(autoSpeakEnabled, isPlaying);
  const iconColor = autoSpeakEnabled
    ? theme.colors.primary
    : theme.colors.onSurfaceVariant;

  return (
    <View style={styles.split} testID="voicechip-split">
      <Pressable
        style={[styles.half, styles.leftHalf]}
        onPress={handleToggleAutoSpeak}
        onLayout={onLeftLayout}
        accessibilityRole="button"
        accessibilityLabel={l10n.voiceAndSpeech.toggleAutoSpeakLabel}
        accessibilityState={{selected: autoSpeakEnabled}}
        testID="voicechip-toggle">
        <SpeakerIcon width={20} height={20} stroke={iconColor} />
        {label !== null && (
          <Text
            numberOfLines={1}
            style={styles.voiceLabel}
            testID="voicechip-label">
            {label}
          </Text>
        )}
      </Pressable>
      <View style={styles.divider} testID="voicechip-divider" />
      <Pressable
        style={[styles.half, styles.rightHalf]}
        onPress={handleOpenSettings}
        accessibilityRole="button"
        accessibilityLabel={l10n.voiceAndSpeech.openSettingsLabel}
        testID="voicechip-gear">
        <SettingsIcon
          width={20}
          height={20}
          stroke={theme.colors.onSurfaceVariant}
        />
      </Pressable>
    </View>
  );
});
