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
    <View accessibilityRole="radiogroup" style={styles.grid}>
      {TOPIC_KEYS.map(key => {
        const isElse = key === 'else';
        const isSelected = selected === key;
        const Glyph = isElse ? undefined : topicChipGlyphs[key];
        const description = descriptions?.[key];
        const announced = description
          ? `${labels[key]}, ${description}`
          : labels[key];
        const chipStyle = [
          styles.chip,
          isElse && styles.chipElse,
          isSelected && styles.chipSelected,
        ];
        const chipBody = (
          <>
            {Glyph ? (
              <Glyph width={40} height={40} fill={theme.colors.onBackground} />
            ) : null}
            <View style={styles.textBlock}>
              <Text style={styles.label}>{labels[key]}</Text>
              {description ? (
                <Text style={styles.description}>{description}</Text>
              ) : null}
            </View>
          </>
        );
        return (
          <View key={key} style={styles.cell}>
            {isElse ? (
              <View
                testID={`onboarding-topic-${key}`}
                accessibilityRole="text"
                accessibilityLabel={announced}
                style={chipStyle}>
                {chipBody}
              </View>
            ) : (
              <Pressable
                testID={`onboarding-topic-${key}`}
                accessibilityRole="radio"
                accessibilityLabel={announced}
                accessibilityState={{selected: isSelected}}
                onPress={() => onSelect(key)}
                style={chipStyle}>
                {chipBody}
              </Pressable>
            )}
          </View>
        );
      })}
    </View>
  );
};
