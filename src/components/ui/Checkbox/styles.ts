import {StyleSheet, type ViewStyle} from 'react-native';

import type {Theme} from '../../../utils/types';

export type CheckboxSize = 's' | 'm' | 'l';

export type CheckboxStyleArgs = {
  size: CheckboxSize;
};

export const createStyles = (_theme: Theme, _args: CheckboxStyleArgs) =>
  StyleSheet.create({
    root: {
      flexDirection: 'row',
      alignItems: 'center',
    } as ViewStyle,
  });
