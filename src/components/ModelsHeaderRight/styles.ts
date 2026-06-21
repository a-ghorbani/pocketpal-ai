import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      marginEnd: theme.spacing.s,
    },
    iconButton: {
      marginHorizontal: theme.spacing.xxs,
    },
    addModel: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xs,
    },
    addModelLabel: {
      ...theme.fonts.titleSmall,
      color: theme.colors.onSurface,
    },
  });
