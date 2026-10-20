import React, {useCallback, useContext, useEffect, useMemo} from 'react';
import {BackHandler, Pressable, StyleSheet, Text, View} from 'react-native';

import {observer} from 'mobx-react';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {useTheme} from '../../hooks';
import {voiceModeStore} from '../../store';
import {L10nContext} from '../../utils';
import {CloseIcon, MicrophoneIcon, MicrophoneOffIcon} from '../../assets/icons';
import {VoiceCloud, voiceVisual} from '../VoiceCloud';

import {useVoiceModeControls} from './controls';
import {useAnnounceVoiceStatus, voiceStatus} from './status';

const CLOUD_SIZE = 280;
const CONTROL_SIZE = 64;
const PULL_DISTANCE = 80;

/**
 * Full-screen voice view over the chat. Pulling down or Android back
 * collapses it to the voice bar; the session keeps running.
 */
export const VoiceModeView: React.FC = observer(() => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const insets = useSafeAreaInsets();
  const {tapCloud, toggleMute, end} = useVoiceModeControls();
  const {phase, micMuted, lastError} = voiceModeStore;
  const visual = voiceVisual(phase, micMuted);
  const status = voiceStatus(phase, micMuted, lastError, l10n.voiceMode);
  const {title, hint} = status;
  useAnnounceVoiceStatus(status, true);

  const collapse = useCallback(() => voiceModeStore.setPresentation('bar'), []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        collapse();
        return true;
      },
    );
    return () => subscription.remove();
  }, [collapse]);

  const pullDown = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetY(15)
        .withTestId('voice-view-pull')
        .onEnd(event => {
          if (event.translationY > PULL_DISTANCE) {
            collapse();
          }
        }),
    [collapse],
  );

  const muteColors = micMuted
    ? {
        backgroundColor: theme.colors.errorContainer,
        icon: theme.colors.onErrorContainer,
      }
    : {
        backgroundColor: theme.colors.surfaceContainerHighest,
        icon: theme.colors.onSurface,
      };

  return (
    <GestureDetector gesture={pullDown}>
      <View
        style={[
          styles.root,
          {
            backgroundColor: theme.colors.background,
            paddingTop: insets.top,
            paddingBottom: insets.bottom + theme.spacing.xl,
          },
        ]}
        accessibilityViewIsModal
        onAccessibilityEscape={collapse}
        testID="voice-view">
        <Pressable
          onPress={collapse}
          accessibilityRole="button"
          accessibilityLabel={l10n.voiceMode.showChatLabel}
          accessibilityHint={l10n.voiceMode.pullDownHint}
          testID="voice-view-collapse"
          style={[styles.top, {gap: theme.spacing.xs}]}>
          <View
            style={[
              styles.handle,
              {backgroundColor: theme.colors.outlineVariant},
            ]}
          />
          <Text
            style={[
              theme.typography.captionM,
              {color: theme.colors.onSurfaceVariant},
            ]}>
            {l10n.voiceMode.pullDownHint}
          </Text>
        </Pressable>

        <View style={[styles.center, {gap: theme.spacing.xl}]}>
          <Pressable
            onPress={tapCloud}
            accessibilityRole="button"
            accessibilityLabel={l10n.voiceMode.cloudLabel}
            accessibilityHint={hint}
            testID="voice-cloud">
            <VoiceCloud visual={visual} size={CLOUD_SIZE} />
          </Pressable>
          <View style={[styles.status, {gap: theme.spacing.xs}]}>
            <Text style={[theme.typography.titleL, {color: theme.colors.text}]}>
              {title}
            </Text>
            <Text
              testID="voice-status-hint"
              style={[
                theme.typography.bodyS,
                {
                  color: status.isError
                    ? theme.colors.error
                    : theme.colors.onSurfaceVariant,
                },
              ]}>
              {hint}
            </Text>
          </View>
        </View>

        <View style={[styles.controls, {gap: theme.spacing.xxl}]}>
          <Pressable
            onPress={toggleMute}
            accessibilityRole="switch"
            accessibilityLabel={l10n.voiceMode.micSwitchLabel}
            accessibilityState={{checked: !micMuted}}
            testID="voice-mute"
            style={[
              styles.control,
              {backgroundColor: muteColors.backgroundColor},
            ]}>
            {micMuted ? (
              <MicrophoneOffIcon
                width={24}
                height={24}
                color={muteColors.icon}
              />
            ) : (
              <MicrophoneIcon width={24} height={24} color={muteColors.icon} />
            )}
          </Pressable>
          <Pressable
            onPress={end}
            accessibilityRole="button"
            accessibilityLabel={l10n.voiceMode.endLabel}
            testID="voice-end"
            style={[styles.control, {backgroundColor: theme.colors.primary}]}>
            <CloseIcon width={24} height={24} fill={theme.colors.onPrimary} />
          </Pressable>
        </View>
      </View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: 10,
    elevation: 10,
  },
  top: {
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handle: {
    width: 40,
    height: 5,
    borderRadius: 3,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  status: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  control: {
    width: CONTROL_SIZE,
    height: CONTROL_SIZE,
    borderRadius: CONTROL_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
