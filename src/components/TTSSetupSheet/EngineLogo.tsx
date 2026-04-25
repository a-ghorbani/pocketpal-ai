import React from 'react';
import {Image, View, StyleSheet} from 'react-native';
import Svg, {Circle} from 'react-native-svg';

import {useTheme} from '../../hooks';
import type {EngineId} from '../../services/tts';

import {createStyles} from './styles';

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

const RING_FALLBACK = '#1E4DF6';

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
  const theme = useTheme();
  const styles = createStyles(theme);

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

  const renderInner = () => {
    if (engineId === 'system') {
      return (
        <View
          style={[
            styles.engineLogoSystemBadge,
            {width: inner, height: inner, borderRadius: inner / 2},
          ]}>
          <View style={styles.engineLogoSystemBadgeDot} />
        </View>
      );
    }
    return (
      <View
        style={[
          styles.engineLogoSurface,
          {
            width: inner,
            height: inner,
            borderRadius: inner / 2,
            backgroundColor: bg,
          },
        ]}>
        <Image
          source={LOGO_SOURCES[engineId]}
          style={{width: inner * 0.72, height: inner * 0.72}}
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
            styles.engineLogoHalo,
            {
              width: size + 8,
              height: size + 8,
              borderRadius: (size + 8) / 2,
              backgroundColor: haloColor,
            },
          ]}
        />
      ) : null}
      <View style={styles.engineLogoCenter}>{renderInner()}</View>
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
            stroke={ringColor ?? RING_FALLBACK}
            strokeOpacity={0.2}
            strokeWidth={ringStroke}
            fill="transparent"
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={ringColor ?? RING_FALLBACK}
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
