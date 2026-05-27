import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {Chip} from '../../../components/ui';
import {useTheme} from '../../../hooks';
import type {Theme} from '../../../utils/types';
import {TOPIC_KEYS, type TopicKey} from '../../../store/onboarding/types';
import {onboardingIllustrationPlaceholders as placeholders} from '../../../assets/onboarding/placeholders';

export type TopicChipGridProps = {
  selected: TopicKey | null;
  onSelect: (key: TopicKey | null) => void;
  labels: Record<TopicKey, string>;
};

const ICON_PLACEHOLDER: Record<Exclude<TopicKey, 'else'>, string> = {
  smartchat: placeholders.screen5ChipSmartchat,
  coding: placeholders.screen5ChipCoding,
  education: placeholders.screen5ChipEducation,
  roleplay: placeholders.screen5ChipRoleplay,
  creative_writing: placeholders.screen5ChipCreativeWriting,
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
    chipContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xs,
    },
    iconPlaceholder: {
      ...theme.typography.captionS,
      color: theme.colors.onSurfaceVariant,
    },
  });

export const TopicChipGrid: React.FC<TopicChipGridProps> = ({
  selected,
  onSelect,
  labels,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  return (
    <View style={styles.grid}>
      {TOPIC_KEYS.map(key => {
        const isElse = key === 'else';
        const isSelected = selected === key;
        const onPress = () => onSelect(isElse ? null : key);
        return (
          <View key={key} style={styles.cell}>
            <Chip
              testID={`onboarding-topic-${key}`}
              variant="selectable"
              label={labels[key]}
              selected={isSelected}
              onPress={onPress}
            />
            {!isElse ? (
              <Text style={styles.iconPlaceholder} accessibilityElementsHidden>
                {ICON_PLACEHOLDER[key as Exclude<TopicKey, 'else'>]}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
};
