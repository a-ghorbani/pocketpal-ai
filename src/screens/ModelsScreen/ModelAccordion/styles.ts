import {StyleSheet} from 'react-native';
import {Theme} from '../../../utils';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    accordion: {
      height: 55,
      backgroundColor: theme.colors.surface,
    },
    accordionTitle: {
      fontSize: 14,
    },
    accordionDescription: {
      fontSize: 12,
      paddingBottom: 10,
    },
  });
