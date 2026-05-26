import React from 'react';
import {View, StyleSheet} from 'react-native';

import {Chip} from '../../../components/ui';
import {useTheme} from '../../../hooks';
import type {Theme} from '../../../utils/types';
import {TOPIC_KEYS, type TopicKey} from '../../../store/onboarding/types';

export type TopicChipGridProps = {
  selected: TopicKey[];
  onToggle: (key: TopicKey) => void;
  labels: Record<TopicKey, string>;
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
      // 2-column grid: each chip spans roughly half the row with the
      // inter-cell gap accounted for.
      flexBasis: '48%',
      flexGrow: 1,
    },
  });

export const TopicChipGrid: React.FC<TopicChipGridProps> = ({
  selected,
  onToggle,
  labels,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  return (
    <View style={styles.grid}>
      {TOPIC_KEYS.map(key => {
        const isSelected = selected.includes(key);
        return (
          <View key={key} style={styles.cell}>
            <Chip
              testID={`onboarding-topic-${key}`}
              variant="selectable"
              label={labels[key]}
              selected={isSelected}
              onPress={() => onToggle(key)}
            />
          </View>
        );
      })}
    </View>
  );
};
