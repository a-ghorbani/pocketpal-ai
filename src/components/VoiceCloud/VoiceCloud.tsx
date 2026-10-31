import React, {useEffect} from 'react';
import {StyleSheet, View} from 'react-native';

import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, {Circle, Defs, RadialGradient, Stop} from 'react-native-svg';

import {useTheme} from '../../hooks';

import type {VoiceVisual} from './visual';

/** Blob layout on the 280 px design cloud: diameter, left, top. */
const BLOBS = [
  {d: 200, x: 20, y: 30, drift: [30, -20], period: 7000},
  {d: 180, x: 90, y: 80, drift: [-35, 25], period: 9000},
  {d: 150, x: 60, y: 120, drift: [25, 30], period: 6000},
  {d: 120, x: 130, y: 20, drift: [-35, 25], period: 8000},
] as const;
const DESIGN_SIZE = 280;
const BLUR = 30;

const MOTION = {
  listening: {duration: 850, reverse: true, easing: Easing.inOut(Easing.ease)},
  thinking: {duration: 5000, reverse: false, easing: Easing.linear},
  speaking: {duration: 420, reverse: true, easing: Easing.inOut(Easing.ease)},
} as const;

interface BlobProps {
  index: number;
  color: string;
  scale: number;
  animate: boolean;
}

const Blob: React.FC<BlobProps> = ({index, color, scale, animate}) => {
  const {d, x, y, drift, period} = BLOBS[index];
  const reach = (d / 2 + BLUR) * scale;
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!animate) {
      cancelAnimation(progress);
      progress.value = 0;
      return;
    }
    progress.value = withRepeat(
      withTiming(1, {duration: period / 2, easing: Easing.inOut(Easing.ease)}),
      -1,
      true,
    );
    return () => cancelAnimation(progress);
  }, [animate, period, progress]);

  const driftStyle = useAnimatedStyle(() => ({
    transform: [
      {translateX: drift[0] * scale * progress.value},
      {translateY: drift[1] * scale * progress.value},
    ],
  }));

  const id = `voice-blob-${index}`;
  const solid = (d / 2 - BLUR) / (d / 2 + BLUR);
  return (
    <Animated.View
      style={[
        styles.blob,
        {
          left: (x + d / 2) * scale - reach,
          top: (y + d / 2) * scale - reach,
          width: reach * 2,
          height: reach * 2,
        },
        driftStyle,
      ]}>
      <Svg width={reach * 2} height={reach * 2}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset={0} stopColor={color} stopOpacity={0.95} />
            <Stop offset={solid} stopColor={color} stopOpacity={0.8} />
            <Stop offset={1} stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={reach} cy={reach} r={reach} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
};

interface VoiceCloudProps {
  visual: VoiceVisual | 'still';
  size: number;
}

/**
 * The voice-mode cloud: soft blue, periwinkle and peach blobs whose motion
 * shows the state. Listening breathes, thinking turns slowly, speaking
 * pulses; muted is still and grey; still is in colour without motion.
 */
export const VoiceCloud: React.FC<VoiceCloudProps> = ({visual, size}) => {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const animate = !reduceMotion && visual !== 'muted' && visual !== 'still';
  const progress = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(progress);
    progress.value = 0;
    if (reduceMotion || visual === 'muted' || visual === 'still') {
      return;
    }
    const {duration, reverse, easing} = MOTION[visual];
    progress.value = withRepeat(withTiming(1, {duration, easing}), -1, reverse);
    return () => cancelAnimation(progress);
  }, [progress, reduceMotion, visual]);

  const motionStyle = useAnimatedStyle(() => {
    const p = progress.value;
    switch (visual) {
      case 'listening':
        return {transform: [{scale: 0.94 + 0.12 * p}]};
      case 'thinking':
        return {transform: [{rotate: `${360 * p}deg`}, {scale: 0.86}]};
      case 'speaking':
        return {
          transform: [{scaleX: 0.97 + 0.11 * p}, {scaleY: 1 - 0.05 * p}],
        };
      default:
        return {transform: []};
    }
  });

  const colors =
    visual === 'muted'
      ? [
          theme.colors.onSurfaceVariant,
          theme.colors.outlineVariant,
          theme.colors.surfaceVariant,
          theme.colors.inverseSurface,
        ]
      : [
          theme.colors.secondary,
          theme.colors.tertiary,
          theme.colors.accent.peach,
          theme.colors.inverseSecondary,
        ];
  const scale = size / DESIGN_SIZE;

  return (
    <View
      style={[{width: size, height: size}, visual === 'muted' && styles.muted]}
      testID={`voice-cloud-${visual}`}>
      <Animated.View style={[StyleSheet.absoluteFill, motionStyle]}>
        {colors.map((color, index) => (
          <Blob
            key={index}
            index={index}
            color={color}
            scale={scale}
            animate={animate}
          />
        ))}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  blob: {
    position: 'absolute',
  },
  muted: {
    opacity: 0.4,
  },
});
