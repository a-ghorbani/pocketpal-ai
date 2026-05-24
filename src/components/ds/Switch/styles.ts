import {StyleSheet, type ViewStyle} from 'react-native';

import type {Theme} from '../../../utils/types';

export type SwitchSize = 's' | 'm' | 'l';

export type SwitchStyleArgs = {
  size: SwitchSize;
};

export const createStyles = (_theme: Theme, _args: SwitchStyleArgs) =>
  StyleSheet.create({
    root: {
      flexDirection: 'row',
      alignItems: 'center',
    } as ViewStyle,
  });
