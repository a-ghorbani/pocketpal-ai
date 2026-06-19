import React from 'react';
import {Pressable, Text, View} from 'react-native';

import {useTheme} from '../../../../hooks';
import {createStyles} from './styles';

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
