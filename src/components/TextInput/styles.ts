import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 10,
      alignSelf: 'stretch',
    },
    input: {
      backgroundColor: 'transparent',
    },
    placeholder: {
      opacity: 0.3,
    },
    divider: {
      width: 330,
      height: 0.33,
      backgroundColor: theme.colors.outlineVariant,
      marginLeft: 20,
    },
  });
