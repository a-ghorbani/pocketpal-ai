import React from 'react';
import {Image, View, StyleSheet, Platform} from 'react-native';
import Svg, {Circle} from 'react-native-svg';

import type {EngineId} from '../../services/tts';

const LOGO_SOURCES: Record<Exclude<EngineId, 'system'>, number> = {
  kitten: require('../../assets/images/engines/kitten.png'),
  kokoro: require('../../assets/images/engines/kokoro.png'),
  supertonic: require('../../assets/images/engines/supertonic.png'),
};

const BRAND_BG: Record<EngineId, string> = {
  kitten: '#FFF3EC',
  kokoro: '#17151F',
  supertonic: '#1E4DF6',
  system: '#F1F2F5',
};

const LOGO_TINT: Record<EngineId, string | undefined> = {
  kitten: undefined,
  kokoro: undefined,
  supertonic: undefined,
  system: undefined,
};

interface EngineLogoProps {
  engineId: EngineId;
  size?: number;
  progress?: number | null;
  ringColor?: string;
  /** Soft pulsing ambient ring behind the logo (ready / active state). */
  haloColor?: string;
}

/**
 * Branded engine logo in a rounded "pill" surface, optionally wrapped with
 * a download progress ring. Ring renders only when `progress` is a finite
 * value 0..1 — use null/undefined for static states.
 */
export const EngineLogo: React.FC<EngineLogoProps> = ({
  engineId,
  size = 56,
  progress,
  ringColor,
  haloColor,
}) => {
  const ringStroke = 3;
  const ringPad = 4;
  const inner = size - ringPad * 2;
  const radius = size / 2 - ringStroke / 2;
  const circumference = 2 * Math.PI * radius;
  const ringProgress =
    progress == null || Number.isNaN(progress)
      ? null
      : Math.max(0, Math.min(1, progress));

  const bg = BRAND_BG[engineId];
  const tint = LOGO_TINT[engineId];

  const renderInner = () => {
    if (engineId === 'system') {
      return (
        <View
          style={[
            styles.systemBadge,
            {width: inner, height: inner, borderRadius: inner / 2},
          ]}>
          <View style={styles.systemBadgeDot} />
        </View>
      );
    }
    return (
      <View
        style={[
          styles.logoSurface,
          {
            width: inner,
            height: inner,
            borderRadius: inner / 2,
            backgroundColor: bg,
          },
        ]}>
        <Image
          source={LOGO_SOURCES[engineId]}
          style={{
            width: inner * 0.72,
            height: inner * 0.72,
            tintColor: tint,
          }}
          resizeMode="contain"
        />
      </View>
    );
  };

  return (
    <View style={{width: size, height: size}}>
      {haloColor ? (
        <View
          pointerEvents="none"
          style={[
            styles.halo,
            {
              width: size + 8,
              height: size + 8,
              borderRadius: (size + 8) / 2,
              backgroundColor: haloColor,
            },
          ]}
        />
      ) : null}
      <View style={styles.center}>{renderInner()}</View>
      {ringProgress != null ? (
        <Svg
          width={size}
          height={size}
          style={StyleSheet.absoluteFill}
          pointerEvents="none">
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={ringColor ?? '#1E4DF6'}
            strokeOpacity={0.2}
            strokeWidth={ringStroke}
            fill="transparent"
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={ringColor ?? '#1E4DF6'}
            strokeWidth={ringStroke}
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference * (1 - ringProgress)}
            fill="transparent"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    left: -4,
    top: -4,
    opacity: 0.35,
  },
  logoSurface: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  systemBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Platform.OS === 'ios' ? '#F1F2F5' : '#E8F0E8',
  },
  systemBadgeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Platform.OS === 'ios' ? '#1A1A1A' : '#3DDC84',
  },
});
