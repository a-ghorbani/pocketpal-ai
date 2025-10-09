import {StyleSheet} from 'react-native';

import {Theme} from '../../../utils/types';
import {uiStore} from '../../../store';

export const createStyles = (theme: Theme) => {
  const isDark = uiStore.colorScheme === 'dark';

  return StyleSheet.create({
    fab: {
      bottom: 0,
      right: 16,
      backgroundColor: theme.colors.background,
      borderColor: theme.colors.outline,
      borderWidth: isDark ? 1 : 0,
    },
    actionButton: {
      backgroundColor: theme.colors.background,
      borderColor: theme.colors.outline,
      borderWidth: isDark ? 1 : 0,
    },
    icon: {
      width: 24,
      height: 24,
    },
  });
};
