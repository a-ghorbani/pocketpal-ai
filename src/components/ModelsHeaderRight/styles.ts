import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      marginRight: 8,
    },
    iconButton: {
      marginHorizontal: 2,
    },
    addModel: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    addModelLabel: {
      ...theme.fonts.titleSmall,
      color: theme.colors.onSurface,
    },
  });
