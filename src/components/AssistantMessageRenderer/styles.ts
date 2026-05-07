import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      maxWidth: '100%',
    },
    rawText: {
      color: theme.colors.text,
      fontSize: 16,
      lineHeight: 22,
    },
  });
