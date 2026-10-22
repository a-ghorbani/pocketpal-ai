import React, {useContext, useEffect, useMemo, useRef} from 'react';
import {
  BackHandler,
  type HostInstance,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import {scheduleOnRN} from 'react-native-worklets';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {useTheme} from '../../hooks';
import {L10nContext} from '../../utils';
import {moveScreenReaderFocus} from '../../utils/screenReaderFocus';
import {CloseIcon} from '../../assets/icons';
import {Button, IconButton} from '../ui';
import {VoiceCloud} from '../VoiceCloud';

const CLOUD_SIZE = 280;
const CLOSE_SIZE = 44;
const BUTTON_HEIGHT = 48;
const PULL_DISTANCE = 80;
const FLICK_VELOCITY = 800;

interface VoiceTeaserProps {
  onGetPlus: () => void;
  onKeepTyping: () => void;
  onClose: () => void;
}

/**
 * Locked voice mode, shown over the chat before any paywall: the voice
 * view at rest and a way back to typing. It is a picture, not a session.
 */
export const VoiceTeaser: React.FC<VoiceTeaserProps> = ({
  onGetPlus,
  onKeepTyping,
  onClose,
}) => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const strings = l10n.voiceMode;
  const insets = useSafeAreaInsets();
  const titleRef = useRef<HostInstance>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (titleRef.current) {
        moveScreenReaderFocus(titleRef.current);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        onClose();
        return true;
      },
    );
    return () => subscription.remove();
  }, [onClose]);

  const pullDown = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(15)
        .withTestId('voice-teaser-pull')
        .onEnd(event => {
          if (
            event.translationY > PULL_DISTANCE ||
            event.velocityY > FLICK_VELOCITY
          ) {
            scheduleOnRN(onClose);
          }
        }),
    [onClose],
  );

  return (
    <GestureDetector gesture={pullDown}>
      <View
        style={[
          styles.root,
          {
            backgroundColor: theme.colors.background,
            paddingTop: insets.top + theme.spacing.s,
            paddingBottom: insets.bottom + theme.spacing.m,
            paddingHorizontal: theme.spacing.m,
          },
        ]}
        accessibilityViewIsModal
        onAccessibilityEscape={onClose}
        testID="voice-teaser">
        <IconButton
          variant="outlined"
          size="l"
          icon={
            <CloseIcon width={24} height={24} fill={theme.colors.onSurface} />
          }
          accessibilityLabel={l10n.common.close}
          onPress={onClose}
          testID="voice-teaser-close"
          style={styles.close}
        />

        <View
          style={styles.center}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants">
          <VoiceCloud visual="still" size={CLOUD_SIZE} />
        </View>

        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderWidth: theme.stroke.sm,
              borderRadius: theme.radius.l,
              padding: theme.spacing.ml,
              gap: theme.spacing.s,
            },
          ]}>
          <Text
            ref={titleRef}
            accessibilityRole="header"
            style={[
              theme.typography.headlineH1,
              styles.title,
              {color: theme.colors.text},
            ]}>
            {strings.teaserTitle}
          </Text>
          <Text
            style={[
              theme.typography.bodyM,
              {color: theme.colors.onSurfaceVariant},
            ]}>
            {strings.teaserBody}
          </Text>
          <View style={{gap: theme.spacing.s, marginTop: theme.spacing.s}}>
            <Button
              size="l"
              label={strings.teaserGetPlus}
              onPress={onGetPlus}
              testID="voice-teaser-get-plus"
              style={styles.action}
            />
            <Button
              size="l"
              accessibilityLabel={strings.teaserKeepTyping}
              onPress={onKeepTyping}
              testID="voice-teaser-keep-typing"
              style={[
                styles.action,
                {
                  backgroundColor: theme.colors.btnReadyBg,
                  borderColor: theme.colors.btnReadyBorder,
                  borderWidth: theme.stroke.sm,
                },
              ]}>
              <Text
                style={[
                  theme.typography.uiM,
                  {color: theme.colors.btnReadyText},
                ]}>
                {strings.teaserKeepTyping}
              </Text>
            </Button>
          </View>
        </View>
      </View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: 10,
    elevation: 10,
  },
  close: {
    width: CLOSE_SIZE,
    height: CLOSE_SIZE,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    alignSelf: 'stretch',
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
  },
  action: {
    minHeight: BUTTON_HEIGHT,
  },
});
