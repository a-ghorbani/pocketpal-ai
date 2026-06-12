import React from 'react';
import {Pressable, Text, View} from 'react-native';

import {useTheme} from '../../hooks';
import {createStyles} from './styles';

export type DownloadProgressCardProps = {
  /** Visible model identifier (e.g., `Llama-3.2-1B-Instruct (Q4_K_M)`). */
  modelName: string;
  /** Right-aligned size string (e.g., `800 MB`). Empty to hide. */
  sizeLabel?: string;
  /** 0..100. */
  progress: number;
  /** Left caption (e.g., `358 MB · 0.6 MB/s`). */
  bytesLabel: string;
  /** Right caption (e.g., `4 min left`). */
  etaLabel: string;
  /** Inline Stop button (used in list contexts; omit for onboarding-style use). */
  onStop?: () => void;
  stopLabel?: string;
};

/**
 * Reusable progress card matching the Figma `Download` row pattern. Used by
 * `DownloadSheet` (onboarding-initiated downloads, no inline Stop) and the
 * Models / PalsHub list rows (inline Stop, smaller surrounding chrome).
 */
export const DownloadProgressCard: React.FC<DownloadProgressCardProps> = ({
  modelName,
  sizeLabel,
  progress,
  bytesLabel,
  etaLabel,
  onStop,
  stopLabel = 'Stop',
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const clamped = Math.max(0, Math.min(100, progress));

  return (
    <View testID="download-progress-card" style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
          {modelName}
        </Text>
        {sizeLabel ? <Text style={styles.size}>{sizeLabel}</Text> : null}
      </View>
      <View style={styles.actionRow}>
        <View style={styles.progressGroup}>
          <View style={styles.track}>
            <View style={[styles.fill, {width: `${clamped}%`}]} />
          </View>
          <View style={styles.captionRow}>
            <Text style={styles.bytes}>{bytesLabel}</Text>
            <Text style={styles.eta}>{etaLabel}</Text>
          </View>
        </View>
        {onStop ? (
          <Pressable
            testID="download-progress-stop"
            accessibilityRole="button"
            accessibilityLabel={stopLabel}
            onPress={onStop}
            style={styles.stopBtn}>
            <Text style={styles.stopText}>{stopLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
};
