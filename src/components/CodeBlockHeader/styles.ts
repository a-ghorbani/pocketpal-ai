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
    },
    iconTouchable: {
      padding: 4,
      justifyContent: 'center',
      alignItems: 'center',
    },
  });
