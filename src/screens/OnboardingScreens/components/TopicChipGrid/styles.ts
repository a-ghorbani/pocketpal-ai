import {StyleSheet} from 'react-native';

import type {Theme} from '../../../../utils/types';

export const createStyles = (theme: Theme) =>
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
