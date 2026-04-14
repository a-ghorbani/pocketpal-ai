import React, {useContext} from 'react';
import {Pressable, View} from 'react-native';
import {observer} from 'mobx-react';

import {useTheme} from '../../hooks';
import {ttsStore} from '../../store';
import {L10nContext} from '../../utils';
import {
  ChevronDownIcon,
  SettingsIcon,
  VolumeOffIcon,
  VolumeOnIcon,
  WavesIcon,
} from '../../assets/icons';

import {createStyles} from './styles';

// Flip this to compare variants on device.
// 'gear'     → small ⚙ as secondary (opens setup sheet)
// 'chevron'  → small ▾ as secondary (opens setup sheet, reads as "more options")
const SECONDARY_VARIANT: 'gear' | 'chevron' = 'chevron';

const pickSpeakerIcon = (autoSpeakEnabled: boolean, isPlaying: boolean) => {
  if (isPlaying) {
    return WavesIcon;
  }
  return autoSpeakEnabled ? VolumeOnIcon : VolumeOffIcon;
};

/**
 * Compact voice control. Two halves in one pill, sized with hierarchy:
 *  - Primary (≥44pt) speaker — toggles auto-speak
 *  - Secondary (28pt) — opens setup sheet (gear or chevron variant)
 *
 * First-use (no voice yet): both halves collapse to "open setup sheet" so
 * the user never hits a dead state. Hidden entirely on low-memory devices.
 */
export const VoiceChip: React.FC = observer(() => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const styles = createStyles();

  const isAvailable = ttsStore.isTTSAvailable;
  const currentVoice = ttsStore.currentVoice;
  const autoSpeakEnabled = ttsStore.autoSpeakEnabled;
  const playbackState = ttsStore.playbackState;
  const isPlaying =
    playbackState.mode === 'playing' || playbackState.mode === 'streaming';

  if (!isAvailable) {
    return null;
  }

  const hasVoice = currentVoice != null;

  const handleSpeakerPress = () => {
    // Pre-setup: speaker tap opens setup sheet (no voice to toggle).
    // Post-setup: toggles auto-speak.
    if (!hasVoice) {
      ttsStore.openSetupSheet();
      return;
    }
    ttsStore.setAutoSpeak(!autoSpeakEnabled);
  };

  const handleSecondaryPress = () => {
    ttsStore.openSetupSheet();
  };

  const SpeakerIcon = pickSpeakerIcon(autoSpeakEnabled, isPlaying);
  const speakerColor =
    hasVoice && autoSpeakEnabled
      ? theme.colors.primary
      : theme.colors.onSurfaceVariant;

  const SecondaryIcon =
    SECONDARY_VARIANT === 'chevron' ? ChevronDownIcon : SettingsIcon;
  const secondarySize = SECONDARY_VARIANT === 'chevron' ? 16 : 14;

  return (
    <View style={styles.container} testID="voicechip">
      <Pressable
        style={styles.speakerHalf}
        onPress={handleSpeakerPress}
        accessibilityRole="button"
        accessibilityLabel={
          hasVoice
            ? l10n.voiceAndSpeech.toggleAutoSpeakLabel
            : l10n.voiceAndSpeech.openSettingsLabel
        }
        accessibilityState={hasVoice ? {selected: autoSpeakEnabled} : undefined}
        testID="voicechip-speaker">
        <SpeakerIcon width={20} height={20} stroke={speakerColor} />
      </Pressable>
      <Pressable
        style={styles.secondaryHalf}
        onPress={handleSecondaryPress}
        accessibilityRole="button"
        accessibilityLabel={l10n.voiceAndSpeech.openSettingsLabel}
        testID="voicechip-secondary">
        <SecondaryIcon
          width={secondarySize}
          height={secondarySize}
          stroke={theme.colors.onSurfaceVariant}
        />
      </Pressable>
    </View>
  );
});
