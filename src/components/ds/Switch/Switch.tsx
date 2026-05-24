import React from 'react';
import {View} from 'react-native';
import {Switch as PaperSwitch} from 'react-native-paper';

import {useTheme} from '../../../hooks';

import type {CommonDSProps} from '../types';
import {warnIfNoA11yLabel} from '../types';

import {createStyles, type SwitchSize} from './styles';

export type SwitchVariant = 'default';

export type SwitchProps = Omit<CommonDSProps, 'accessibilityRole'> & {
  variant?: SwitchVariant;
  size?: SwitchSize;
  value: boolean;
  onValueChange: (value: boolean) => void;
  /** Required (D34 single-form) — Switch has no visible label. */
  accessibilityLabel: string;
};

/**
 * DS Switch — Paper wrap (D22). Paper handles accessibilityRole=
 * 'switch', accessibilityValue, and the platform-specific iOS/
 * Android thumb-track behaviour we do not want to re-implement.
 *
 * Defaults: variant='default', size='m', testID='ds-switch'.
 */
export const Switch: React.FC<SwitchProps> = ({
  testID = 'ds-switch',
  accessibilityLabel,
  accessibilityHint,
  style,
  disabled,
  variant: _variant = 'default',
  size = 'm',
  value,
  onValueChange,
}) => {
  const theme = useTheme();
  warnIfNoA11yLabel('Switch', undefined, accessibilityLabel);
  const styles = createStyles(theme, {size});
  return (
    <View testID={testID} style={[styles.root, style]}>
      <PaperSwitch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        color={theme.colors.primary}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
      />
    </View>
  );
};
