import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import {useTheme} from '../../../hooks';
import type {Theme} from '../../../utils/types';
import {TOPIC_KEYS, type TopicKey} from '../../../store/onboarding/types';
import {topicChipGlyphs} from '../../../assets/onboarding/illustrations';

export type TopicChipGridProps = {
  selected: TopicKey | null;
  onSelect: (key: TopicKey | null) => void;
  labels: Record<TopicKey, string>;
  descriptions?: Partial<Record<TopicKey, string>>;
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      width: 362,
      gap: theme.spacing.s,
    },
    cell: {
      // Figma chips: 177×160 exactly. 362-width grid with 8px gap →
      // (362-8)/2 = 177 per cell.
      width: 177,
      height: 160,
    },
    chip: {
      flex: 1,
      borderRadius: theme.radius.s,
      backgroundColor: theme.colors.background,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.ml,
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing.sm,
    },
    chipElse: {
      backgroundColor: 'transparent',
      borderWidth: theme.stroke.sm,
      borderColor: theme.colors.outline,
    },
    chipSelected: {
      backgroundColor: theme.colors.secondaryContainer,
    },
    label: {
      ...theme.typography.titleS,
      color: theme.colors.onBackground,
      textAlign: 'center',
      width: '100%',
    },
    description: {
      ...theme.typography.bodyS,
      color: theme.colors.onBackground,
      opacity: 0.7,
      textAlign: 'center',
      width: '100%',
    },
    textBlock: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing.xs,
      width: '100%',
    },
  });

export const TopicChipGrid: React.FC<TopicChipGridProps> = ({
  selected,
  onSelect,
  labels,
  descriptions,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  return (
    <View style={styles.grid}>
      {TOPIC_KEYS.map(key => {
        const isElse = key === 'else';
        const isSelected = selected === key;
        const onPress = () => onSelect(isElse ? null : key);
        const Glyph = isElse ? undefined : topicChipGlyphs[key];
        const description = descriptions?.[key];
        return (
          <View key={key} style={styles.cell}>
            <Pressable
              testID={`onboarding-topic-${key}`}
              accessibilityRole="button"
              accessibilityLabel={labels[key]}
              accessibilityState={{selected: isSelected}}
              onPress={onPress}
              style={[
                styles.chip,
                isElse && styles.chipElse,
                isSelected && styles.chipSelected,
              ]}>
              {Glyph ? (
                <Glyph
                  width={40}
                  height={40}
                  fill={theme.colors.onBackground}
                />
              ) : null}
              <View style={styles.textBlock}>
                <Text style={styles.label}>{labels[key]}</Text>
                {description ? (
                  <Text style={styles.description}>{description}</Text>
                ) : null}
              </View>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
};
