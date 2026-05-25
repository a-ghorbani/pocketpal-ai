import React from 'react';
import {
  Pressable as RNPressable,
  View,
  type PressableProps as RNPressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import {useTheme} from '../../../../hooks';

import {createStateLayerStyle} from './styles';

export type PressablePrimitiveProps = Omit<
  RNPressableProps,
  'style' | 'children'
> & {
  /**
   * Outer style for the Pressable container. May be a static style or
   * a function of (pressed, hovered, focused, disabled) — additive on
   * top of the state-layer overlay.
   */
  style?:
    | StyleProp<ViewStyle>
    | ((state: {
        pressed: boolean;
        hovered?: boolean;
        focused?: boolean;
        disabled?: boolean;
      }) => StyleProp<ViewStyle>);
  /**
   * Color of the state-layer overlay rendered on press/focus/hover.
   * Defaults to theme.colors.onSurface so the overlay reads correctly
   * on every surface variant.
   */
  stateLayerColor?: string;
  children?: React.ReactNode;
};

/**
 * DS Pressable primitive. Wraps RN Pressable and renders a token-bound
 * state-layer overlay on press / focus / hover. Tokens-only; does NOT
 * supply padding, radius, or background — consumers wrap in their own
 * styled View or pass an outer style.
 */
export const Pressable: React.FC<PressablePrimitiveProps> = ({
  style,
  stateLayerColor,
  disabled,
  children,
  ...rest
}) => {
  const theme = useTheme();
  const overlayColor = stateLayerColor ?? theme.colors.onSurface;
  const isDisabled = disabled === true ? true : undefined;

  return (
    <RNPressable
      {...rest}
      disabled={disabled}
      accessibilityState={{
        ...(rest.accessibilityState ?? {}),
        ...(isDisabled ? {disabled: true} : {}),
      }}
      style={state => {
        const outer =
          typeof style === 'function'
            ? style({
                pressed: state.pressed,
                hovered: undefined,
                focused: undefined,
                disabled: isDisabled,
              })
            : style;
        return outer;
      }}>
      {state => {
        const overlay = createStateLayerStyle(theme, {
          state: {pressed: state.pressed, disabled: isDisabled},
          stateLayerColor: overlayColor,
        });
        return (
          <>
            {children}
            {overlay ? (
              <View
                pointerEvents="none"
                testID="ds-pressable-state-layer"
                style={overlay}
              />
            ) : null}
          </>
        );
      }}
    </RNPressable>
  );
};
