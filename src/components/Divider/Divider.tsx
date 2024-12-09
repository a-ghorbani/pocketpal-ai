import React from 'react';

import {Divider as PaperDivider, DividerProps} from 'react-native-paper';

import {useTheme} from '../../hooks';

import {createStyles} from './styles';

export const Divider: React.FC<DividerProps> = props => {
  const theme = useTheme();
  const styles = createStyles(theme);

  return <PaperDivider {...props} style={[styles.separator, props.style]} />;
};
