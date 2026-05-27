import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import {useTheme} from '../../../hooks';
import type {Theme} from '../../../utils/types';

export type ModelOption = {
  id: string;
  title: string;
  subtitle: string;
  recommended?: boolean;
};

export type ModelRadioGroupProps = {
  options: ModelOption[];
  selectedId: string | null;
  recommendedBadgeLabel?: string;
  onSelect: (id: string) => void;
};

// Figma palette for the recommended (Balanced) card — sourced from
// the canonical file's `Color/Yellow/*` band.
const RECOMMENDED_BG = '#F5DBBC'; // Color/yellow/subtle
const RECOMMENDED_BORDER = '#A86C34'; // Color/yellow/highest-contrast
const RECOMMENDED_BADGE_TEXT = '#F8F1E2'; // Color/yellow/mute

const createStyles = (theme: Theme, selected: boolean, recommended: boolean) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.ml,
      borderRadius: theme.radius.l,
      borderWidth: recommended ? theme.stroke.sm : 0,
      borderColor: recommended ? RECOMMENDED_BORDER : 'transparent',
      backgroundColor: recommended ? RECOMMENDED_BG : theme.colors.background,
      marginBottom: theme.spacing.s,
      // Card drop shadow — Figma "Subtle Shadow" 0/2/4 8% black.
      shadowColor: theme.colors.shadow,
      shadowOffset: {width: 0, height: 2},
      shadowOpacity: 0.08,
      shadowRadius: 2,
      elevation: 2,
    },
    radio: {
      // 16×16 ring, active variant: 1.5px yellow/highest-contrast
      // border + 8px inner dot. Default: 1px light-grey border.
      width: 16,
      height: 16,
      borderRadius: 16,
      borderWidth: selected ? 1.5 : 1,
      borderColor: selected ? RECOMMENDED_BORDER : theme.colors.outlineVariant,
      backgroundColor: theme.colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioDot: {
      width: 8,
      height: 8,
      borderRadius: 8,
      backgroundColor: RECOMMENDED_BORDER,
    },
    body: {
      flex: 1,
      gap: theme.spacing.xs,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.s,
    },
    title: {
      ...theme.typography.titleS,
      color: theme.colors.onBackground,
    },
    subtitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xs,
    },
    subtitle: {
      ...theme.typography.captionS,
      color: theme.colors.onBackground,
      opacity: 0.7,
    },
    badge: {
      paddingHorizontal: theme.spacing.s,
      paddingVertical: theme.spacing.xxs,
      borderRadius: theme.radius.xs,
      backgroundColor: RECOMMENDED_BORDER,
    },
    badgeText: {
      ...theme.typography.captionM,
      fontWeight: '500',
      color: RECOMMENDED_BADGE_TEXT,
    },
  });

export const ModelRadioGroup: React.FC<ModelRadioGroupProps> = ({
  options,
  selectedId,
  recommendedBadgeLabel,
  onSelect,
}) => {
  const theme = useTheme();
  return (
    <View>
      {options.map(opt => {
        const selected = selectedId === opt.id;
        const recommended = !!opt.recommended;
        const styles = createStyles(theme, selected, recommended);
        return (
          <Pressable
            key={opt.id}
            testID={`onboarding-pip-model-${opt.id}`}
            accessibilityRole="radio"
            accessibilityState={{selected}}
            accessibilityLabel={opt.title}
            onPress={() => onSelect(opt.id)}
            style={styles.row}>
            <View style={styles.radio}>
              {selected ? <View style={styles.radioDot} /> : null}
            </View>
            <View style={styles.body}>
              <View style={styles.titleRow}>
                <Text style={styles.title}>{opt.title}</Text>
                {recommended && recommendedBadgeLabel ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {recommendedBadgeLabel}
                    </Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.subtitleRow}>
                <Text style={styles.subtitle}>{opt.subtitle}</Text>
              </View>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
};
