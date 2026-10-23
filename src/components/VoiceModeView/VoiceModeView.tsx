import React, {useCallback, useContext, useEffect, useMemo} from 'react';
import {
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import {observer} from 'mobx-react';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {scheduleOnRN} from 'react-native-worklets';
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
/** A downward flick this fast (pt/s) collapses the view whatever the distance. */
const FLICK_VELOCITY = 800;
const SLIDE_MS = 220;

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

  const {height} = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const offset = useSharedValue(reduceMotion ? 0 : height);

  useEffect(() => {
    if (!reduceMotion) {
      offset.value = withTiming(0, {duration: SLIDE_MS});
    }
  }, [offset, reduceMotion]);

  const dragStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      offset.value,
      [0, height],
      [1, 0.4],
      Extrapolation.CLAMP,
    ),
    transform: [
      {translateY: offset.value},
      {
        scale: interpolate(
          offset.value,
          [0, height],
          [1, 0.94],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

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
        .activeOffsetY(15)
        .withTestId('voice-view-pull')
        .onUpdate(event => {
          if (!reduceMotion) {
            offset.value = Math.max(0, event.translationY);
          }
        })
        .onEnd(event => {
          const collapses =
            event.translationY > PULL_DISTANCE ||
            event.velocityY > FLICK_VELOCITY;
          if (!collapses) {
            if (!reduceMotion) {
              offset.value = withSpring(0);
            }
            return;
          }
          if (reduceMotion) {
            scheduleOnRN(collapse);
            return;
          }
          offset.value = withTiming(height, {duration: SLIDE_MS}, finished => {
            if (finished) {
              scheduleOnRN(collapse);
            }
          });
        }),
    [collapse, height, offset, reduceMotion],
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
      <Animated.View
        style={[
          dragStyle,
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
      </Animated.View>
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
