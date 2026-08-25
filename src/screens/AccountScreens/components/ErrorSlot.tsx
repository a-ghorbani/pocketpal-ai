import React from 'react';
import {Text} from 'react-native';

import {useTheme} from '../../../hooks';

import {createStyles} from '../styles';

type ErrorSlotProps = {
  testID: string;
  message: string | null;
};

export const ErrorSlot: React.FC<ErrorSlotProps> = ({testID, message}) => {
  const theme = useTheme();
  const styles = createStyles(theme);

  if (!message) {
    return null;
  }

  return (
    <Text testID={testID} style={styles.error}>
      {message}
    </Text>
  );
};
