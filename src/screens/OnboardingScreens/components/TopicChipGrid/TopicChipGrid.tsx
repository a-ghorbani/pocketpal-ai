import React from 'react';
import {Pressable, Text, View} from 'react-native';

import {useTheme} from '../../../../hooks';
import {TOPIC_KEYS, type TopicKey} from '../../../../store/onboarding/types';
import {topicChipGlyphs} from '../../../../assets/onboarding/illustrations';
import {createStyles} from './styles';

export type TopicChipGridProps = {
  selected: TopicKey | null;
  onSelect: (key: TopicKey) => void;
  labels: Record<TopicKey, string>;
  descriptions?: Partial<Record<TopicKey, string>>;
};

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
        const isSelected = selected === key;
        const Glyph = topicChipGlyphs[key];
        const description = descriptions?.[key];
        return (
          <View key={key} style={styles.cell}>
            <Pressable
              testID={`onboarding-topic-${key}`}
              accessibilityRole="button"
              accessibilityLabel={labels[key]}
              accessibilityState={{selected: isSelected}}
              onPress={() => onSelect(key)}
              style={[styles.chip, isSelected && styles.chipSelected]}>
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
