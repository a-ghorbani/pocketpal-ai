import {StyleSheet} from 'react-native';

import type {Theme} from '../../../../utils/types';

export type PressableState = {
  pressed: boolean;
  hovered?: boolean;
  focused?: boolean;
  disabled?: boolean;
};

export type PressableStyleArgs = {
  state: PressableState;
  stateLayerColor: string;
};

/**
 * Returns the state-layer overlay style for a given pressable state.
 *
 * The overlay is a transparent color with an opacity from
 * theme.colors.{pressedStateOpacity, focusStateOpacity, hoverStateOpacity}.
 * It is the ONLY visual the Pressable primitive contributes; padding,
 * radius, background, etc. come from the consumer's outer style.
 */
export const createStateLayerStyle = (
  theme: Theme,
  {state, stateLayerColor}: PressableStyleArgs,
) => {
  if (state.disabled) {
    return null;
  }

  let opacity: number | null = null;
  if (state.pressed) {
    opacity = theme.colors.pressedStateOpacity;
  } else if (state.focused) {
    opacity = theme.colors.focusStateOpacity;
  } else if (state.hovered) {
    opacity = theme.colors.hoverStateOpacity;
  }

  if (opacity === null || opacity === undefined) {
    return null;
  }

  return {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: stateLayerColor,
    opacity,
  } as const;
};
