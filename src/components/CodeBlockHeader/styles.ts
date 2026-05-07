import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    codeHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    codeLanguage: {
      color: theme.colors.onSurfaceVariant,
      fontSize: 12,
      flex: 1,
    },
    actionsContainer: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    iconButton: {
      margin: 0,
    },
    iconTouchable: {
      padding: 12, // 16 (icon) + 10*2 = 40 for accessibility
      justifyContent: 'center',
      alignItems: 'center',
    },
  });
