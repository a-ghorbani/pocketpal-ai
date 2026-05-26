import React from 'react';
import {View, Text, StyleSheet, Pressable} from 'react-native';

import {useTheme} from '../../../hooks';
import type {Theme} from '../../../utils/types';

export type ModelOption = {
  id: string;
  title: string;
  subtitle: string;
};

export type ModelRadioGroupProps = {
  options: ModelOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

const createStyles = (theme: Theme, selected: boolean) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: theme.spacing.m,
      paddingVertical: theme.spacing.sm,
      borderRadius: theme.radius.m,
      borderWidth: theme.stroke.sm,
      borderColor: selected
        ? theme.colors.primary
        : theme.colors.outlineVariant,
      backgroundColor: selected
        ? theme.colors.primaryContainer
        : theme.colors.surface,
      gap: theme.spacing.sm,
      marginBottom: theme.spacing.s,
    },
    title: {
      ...theme.typography.titleS,
      color: theme.colors.onSurface,
    },
    subtitle: {
      ...theme.typography.bodyS,
      color: theme.colors.textSecondary,
    },
    bullet: {
      width: theme.spacing.sm,
      height: theme.spacing.sm,
      borderRadius: theme.radius.s,
      backgroundColor: selected
        ? theme.colors.primary
        : theme.colors.outlineVariant,
    },
    body: {
      flex: 1,
    },
  });

export const ModelRadioGroup: React.FC<ModelRadioGroupProps> = ({
  options,
  selectedId,
  onSelect,
}) => {
  const theme = useTheme();
  return (
    <View>
      {options.map(opt => {
        const selected = selectedId === opt.id;
        const styles = createStyles(theme, selected);
        return (
          <Pressable
            key={opt.id}
            testID={`onboarding-pip-model-${opt.id}`}
            accessibilityRole="radio"
            accessibilityState={{selected}}
            accessibilityLabel={opt.title}
            onPress={() => onSelect(opt.id)}
            style={styles.row}>
            <View style={styles.bullet} />
            <View style={styles.body}>
              <Text style={styles.title}>{opt.title}</Text>
              <Text style={styles.subtitle}>{opt.subtitle}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
};
