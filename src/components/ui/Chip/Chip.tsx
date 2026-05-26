import React from 'react';
import {Text, View} from 'react-native';

import {useTheme} from '../../../hooks';
import {Pressable} from '../primitives/Pressable';

import type {CommonDSProps, WithRequiredA11yLabel} from '../types';
import {warnIfNoA11yLabel} from '../types';

import {createStyles, type ChipSize, type ChipVariant} from './styles';

type ChipBase = CommonDSProps & {
  variant?: ChipVariant;
  size?: ChipSize;
  label?: string;
  accessibilityLabel?: string;
  selected?: boolean;
  leadingIcon?: React.ReactNode;
  onPress?: () => void;
  children?: React.ReactNode;
};

export type ChipProps = WithRequiredA11yLabel<ChipBase>;

const isInteractive = (variant: ChipVariant) =>
  variant === 'selectable' || variant === 'input';

/**
 * DS Chip.
 *
 * Variants:
 * - display: non-interactive label chip (View root).
 * - selectable: pressable with `selected` toggling visual binding.
 * - input: pressable for input-context (e.g. removable chip).
 *
 * Defaults: variant='display', size='m', testID='ui-chip',
 * accessibilityRole='button' (interactive) / 'text' (display).
 */
export const Chip: React.FC<ChipProps> = props => {
  const theme = useTheme();
  const {
    testID = 'ui-chip',
    accessibilityLabel,
    accessibilityHint,
    style,
    disabled,
    variant = 'display',
    size = 'm',
    selected,
    leadingIcon,
    label,
    onPress,
    children,
  } = props as ChipBase;
  warnIfNoA11yLabel('Chip', label, accessibilityLabel);
  const interactive = isInteractive(variant);
  const accessibilityRole =
    props.accessibilityRole ?? (interactive ? 'button' : 'text');
  const styles = createStyles(theme, {variant, size, selected, disabled});
  const body = (
    <>
      {leadingIcon}
      {label ? <Text style={styles.label}>{label}</Text> : null}
      {children}
    </>
  );

  if (interactive) {
    return (
      <Pressable
        testID={testID}
        accessibilityRole={accessibilityRole}
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={accessibilityHint}
        accessibilityState={
          variant === 'selectable' ? {selected: !!selected} : undefined
        }
        disabled={disabled}
        onPress={onPress}
        style={[styles.root, style]}>
        {body}
      </Pressable>
    );
  }

  return (
    <View
      testID={testID}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      style={[styles.root, style]}>
      {body}
    </View>
  );
};
