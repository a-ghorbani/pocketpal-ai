import React, {useCallback, useContext, useMemo} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import {observer} from 'mobx-react';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';

import {useTheme} from '../../hooks';
import {voiceModeStore} from '../../store';
import {L10nContext} from '../../utils';
import {CloseIcon, MicrophoneIcon, MicrophoneOffIcon} from '../../assets/icons';
import {VoiceCloud, voiceVisual} from '../VoiceCloud';
import {
  useAnnounceVoiceStatus,
  useVoiceModeControls,
  voiceStatus,
} from '../VoiceModeView';

const CLOUD_SIZE = 56;
const CONTROL_SIZE = 48;
const SWIPE_DISTANCE = 40;

/**
 * The collapsed voice session in the composer's place: the chat stays
 * visible above it. Tapping or swiping up opens the voice view again.
 */
export const VoiceBar: React.FC = observer(() => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const {toggleMute, end} = useVoiceModeControls();
  const {phase, micMuted, lastError, presentation} = voiceModeStore;
  const visual = voiceVisual(phase, micMuted);
  const status = voiceStatus(phase, micMuted, lastError, l10n.voiceMode);
  useAnnounceVoiceStatus(status, presentation === 'bar');

  const expand = useCallback(() => voiceModeStore.setPresentation('full'), []);
  const swipeUp = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetY(-15)
        .withTestId('voice-bar-swipe')
        .onEnd(event => {
          if (event.translationY < -SWIPE_DISTANCE) {
            expand();
          }
        }),
    [expand],
  );

  return (
    <GestureDetector gesture={swipeUp}>
      <View
        testID="voice-bar"
        style={[
          styles.bar,
          {
            backgroundColor: theme.colors.secondaryDefault,
            margin: theme.spacing.sm,
            padding: theme.spacing.xs,
            gap: theme.spacing.s,
            shadowColor: theme.colors.shadow,
          },
        ]}>
        <Pressable
          onPress={expand}
          accessibilityRole="button"
          accessibilityLabel={l10n.voiceMode.openViewLabel}
          testID="voice-bar-expand"
          style={[styles.expand, {gap: theme.spacing.sm}]}>
          <View style={styles.cloud}>
            {presentation === 'bar' && (
              <VoiceCloud visual={visual} size={CLOUD_SIZE} />
            )}
          </View>
          <View style={styles.text}>
            <Text
              numberOfLines={1}
              style={[theme.typography.titleS, {color: theme.colors.text}]}>
              {status.title}
            </Text>
            <Text
              numberOfLines={1}
              style={[
                theme.typography.captionM,
                {
                  color: status.isError
                    ? theme.colors.error
                    : theme.colors.onSurfaceVariant,
                },
              ]}>
              {status.isError ? status.hint : l10n.voiceMode.swipeUpHint}
            </Text>
          </View>
        </Pressable>
        <Pressable
          onPress={toggleMute}
          accessibilityRole="switch"
          accessibilityLabel={l10n.voiceMode.micSwitchLabel}
          accessibilityState={{checked: !micMuted}}
          testID="voice-bar-mute"
          style={[
            styles.control,
            {
              backgroundColor: micMuted
                ? theme.colors.errorContainer
                : theme.colors.surfaceContainerHighest,
            },
          ]}>
          {micMuted ? (
            <MicrophoneOffIcon
              width={20}
              height={20}
              color={theme.colors.onErrorContainer}
            />
          ) : (
            <MicrophoneIcon
              width={20}
              height={20}
              color={theme.colors.onSurface}
            />
          )}
        </Pressable>
        <Pressable
          onPress={end}
          accessibilityRole="button"
          accessibilityLabel={l10n.voiceMode.endLabel}
          testID="voice-bar-end"
          style={[styles.control, {backgroundColor: theme.colors.primary}]}>
          <CloseIcon width={20} height={20} fill={theme.colors.onPrimary} />
        </Pressable>
      </View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 32,
    shadowOffset: {width: 0, height: -4},
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 4,
  },
  expand: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cloud: {
    width: CLOUD_SIZE,
    height: CLOUD_SIZE,
    borderRadius: CLOUD_SIZE / 2,
    overflow: 'hidden',
  },
  text: {
    flex: 1,
  },
  control: {
    width: CONTROL_SIZE,
    height: CONTROL_SIZE,
    borderRadius: CONTROL_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
