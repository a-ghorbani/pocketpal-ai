import React from 'react';
import {Image, Pressable, StyleSheet, Text, View} from 'react-native';

import {useTheme} from '../../../hooks';
import type {Theme} from '../../../utils/types';
import {TOPIC_KEYS, type TopicKey} from '../../../store/onboarding/types';
import {topicChipIcons} from '../../../assets/onboarding/illustrations';

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
      paddingHorizontal: theme.spacing.l,
      gap: theme.spacing.sm,
    },
    cell: {
      flexBasis: '48%',
      flexGrow: 1,
    },
    chip: {
      minHeight: 160,
      borderRadius: theme.radius.s,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.ml,
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing.sm,
    },
    chipElse: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: theme.colors.outlineVariant,
    },
    chipSelected: {
      backgroundColor: theme.colors.secondaryContainer,
    },
    icon: {
      width: 40,
      height: 40,
    },
    label: {
      ...theme.typography.titleS,
      color: theme.colors.onSurface,
      textAlign: 'center',
    },
    description: {
      ...theme.typography.bodyS,
      color: theme.colors.onSurfaceVariant,
      textAlign: 'center',
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
        const icon = isElse ? undefined : topicChipIcons[key];
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
              {icon ? (
                <Image
                  source={icon}
                  style={styles.icon}
                  resizeMode="contain"
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                />
              ) : null}
              <Text style={styles.label}>{labels[key]}</Text>
              {description ? (
                <Text style={styles.description}>{description}</Text>
              ) : null}
            </Pressable>
          </View>
        );
      })}
    </View>
  );
};
