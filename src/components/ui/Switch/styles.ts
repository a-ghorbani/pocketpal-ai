import {StyleSheet, type ViewStyle} from 'react-native';

import type {Theme} from '../../../utils/types';

export const createStyles = (_theme: Theme) =>
  StyleSheet.create({
    root: {
      flexDirection: 'row',
      alignItems: 'center',
    } as ViewStyle,
  });
