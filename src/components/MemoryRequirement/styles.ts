import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {},
    row: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 16,
      backgroundColor: theme.colors.surface,
    },
    text: {
      fontSize: 14,
      color: theme.colors.onSurfaceVariant,
    },
  });
