import React, {useContext} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';

import {observer} from 'mobx-react';

import {useTheme} from '../../hooks';
import {modelStore, voiceModeStore} from '../../store';
import {L10nContext} from '../../utils';
import {LockBadgeIcon, VoiceWaveformIcon} from '../../assets/icons';

const SIZE = 40;
const BADGE = 18;

interface VoiceModeButtonProps {
  onPress: () => void;
}

/**
 * The composer's voice-mode button, shown in Send's place while the input
 * is empty. Locked voice mode keeps the button, with a badge.
 */
export const VoiceModeButton: React.FC<VoiceModeButtonProps> = observer(
  ({onPress}) => {
    const theme = useTheme();
    const l10n = useContext(L10nContext);

    if (!voiceModeStore.supported) {
      return null;
    }
    const locked = !voiceModeStore.isUnlocked;
    const loading = modelStore.isContextLoading;

    return (
      <Pressable
        onPress={onPress}
        disabled={loading}
        accessibilityRole="button"
        accessibilityLabel={
          locked ? l10n.voiceMode.startLockedLabel : l10n.voiceMode.startLabel
        }
        accessibilityState={{disabled: loading}}
        testID="voice-mode-button"
        style={[
          styles.button,
          {backgroundColor: theme.colors.primary},
          loading && styles.disabled,
        ]}>
        <VoiceWaveformIcon
          width={22}
          height={22}
          color={theme.colors.onPrimary}
        />
        {locked && (
          <View
            testID="voice-mode-lock"
            style={[
              styles.badge,
              {
                backgroundColor: theme.colors.accent.peach,
                borderColor: theme.colors.surface,
              },
            ]}>
            <LockBadgeIcon
              width={10}
              height={10}
              color={theme.colors.onSurface}
            />
          </View>
        )}
      </Pressable>
    );
  },
);

const styles = StyleSheet.create({
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    marginLeft: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.4,
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
