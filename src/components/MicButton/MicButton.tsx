import React, {useContext} from 'react';
import {Pressable} from 'react-native';

import {observer} from 'mobx-react';
import {useNavigation} from '@react-navigation/native';
import type {DrawerNavigationProp} from '@react-navigation/drawer';

import {useTheme} from '../../hooks';
import {asrStore} from '../../store';
import {L10nContext} from '../../utils';
import {ROUTES} from '../../utils/navigationConstants';
import type {RootDrawerParamList} from '../../utils/types';
import {MicrophoneIcon} from '../../assets/icons';

import {styles} from './styles';

interface MicButtonProps {
  /** Start a voice capture. */
  onStart: () => void;
}

/**
 * Mic button in the composer right-controls, next to send.
 *
 * Self-gates: renders `null` when the ASR availability gate is closed. When
 * the gate is open but the selected tier is not installed, a press routes to
 * the Settings voice-input surface instead of recording. When ready, a tap
 * starts a capture; the composer then shows `VoiceRecordingBar`.
 */
export const MicButton: React.FC<MicButtonProps> = observer(({onStart}) => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const navigation = useNavigation<DrawerNavigationProp<RootDrawerParamList>>();

  if (!asrStore.asrAvailable) {
    return null;
  }

  // Gate-open but not installed → route to setup, do not record.
  if (!asrStore.isSelectedTierReady) {
    return (
      <Pressable
        style={styles.button}
        onPress={() => navigation.navigate(ROUTES.SETTINGS)}
        accessibilityRole="button"
        accessibilityLabel={l10n.voiceInput.setupLabel}
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
      style={styles.button}
      onPress={onStart}
      disabled={asrStore.captureState === 'requesting_perm'}
      accessibilityRole="button"
      accessibilityLabel={l10n.voiceInput.micLabel}
      testID="mic-button">
      <MicrophoneIcon
        width={18}
        height={18}
        stroke={theme.colors.onSurfaceVariant}
      />
    </Pressable>
  );
});
