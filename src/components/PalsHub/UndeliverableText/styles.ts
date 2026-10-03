import {StyleSheet} from 'react-native';
import {Theme} from '../../../utils';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    link: {
      color: theme.colors.primary,
      textDecorationLine: 'underline',
    },
  });
