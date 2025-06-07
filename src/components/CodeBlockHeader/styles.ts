import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    codeHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      padding: 4,
    },
    codeLanguage: {
      color: theme.colors.onSurfaceVariant,
      fontSize: 12,
    },
    iconContainer: {
      marginRight: 5,
      color: theme.colors.onSurfaceVariant,
      fontSize: 16,
    },
  });
