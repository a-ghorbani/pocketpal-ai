import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {useTheme} from '../../../hooks';
import type {Theme} from '../../../utils/types';

export type ComparisonCardsProps = {
  /** Left card label. */
  leftLabel: string;
  /** Right card label. */
  rightLabel: string;
  /** Divider text rendered between the two cards. */
  vsLabel: string;
  /** Optional left visual (asset / SVG). Falls back to the label. */
  leftVisual?: React.ReactNode;
  /** Optional right visual. */
  rightVisual?: React.ReactNode;
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing.m,
    },
    card: {
      flex: 1,
      minHeight: 140,
      paddingHorizontal: theme.spacing.m,
      paddingVertical: theme.spacing.l,
      borderRadius: theme.radius.l,
      borderWidth: theme.stroke.sm,
      borderColor: theme.colors.outlineVariant,
      backgroundColor: theme.colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: {
      ...theme.typography.titleS,
      color: theme.colors.onSurface,
      marginTop: theme.spacing.s,
      textAlign: 'center',
    },
    vs: {
      ...theme.typography.captionM,
      color: theme.colors.onSurfaceVariant,
      paddingHorizontal: theme.spacing.xs,
    },
  });

/**
 * Two-card horizontal layout with a centred divider — used on screen 3
 * to compare on-device vs cloud. Token-bound; no raw hex.
 */
export const ComparisonCards: React.FC<ComparisonCardsProps> = ({
  leftLabel,
  rightLabel,
  vsLabel,
  leftVisual,
  rightVisual,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  return (
    <View style={styles.row}>
      <View style={styles.card}>
        {leftVisual}
        <Text style={styles.label}>{leftLabel}</Text>
      </View>
      <Text style={styles.vs}>{vsLabel}</Text>
      <View style={styles.card}>
        {rightVisual}
        <Text style={styles.label}>{rightLabel}</Text>
      </View>
    </View>
  );
};
