import React from 'react';
import {View} from 'react-native';

import {useTheme} from '../../../hooks';
import {Button} from '../Button';

import {createStyles} from './styles';

export type ActionConfig = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  destructive?: boolean;
};

export type ActionsProps = {
  primary?: ActionConfig;
  secondary?: ActionConfig;
  testID?: string;
};

/**
 * Standard CTA row shared by Sheet/Modal/Dialog. Up to two
 * actions per WHAT §4e.4; bespoke overlays needing more compose
 * their own actions in the body.
 */
export const Actions: React.FC<ActionsProps> = ({
  primary,
  secondary,
  testID = 'ds-actions',
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  if (!primary && !secondary) {
    return null;
  }
  return (
    <View testID={testID} style={styles.actionsRoot}>
      {secondary ? (
        <Button
          variant="tertiary"
          label={secondary.label}
          onPress={secondary.onPress}
          disabled={secondary.disabled}
        />
      ) : null}
      {primary ? (
        <Button
          variant={primary.destructive ? 'destructive' : 'primary'}
          label={primary.label}
          onPress={primary.onPress}
          disabled={primary.disabled}
        />
      ) : null}
    </View>
  );
};
