import {StyleSheet} from 'react-native';

import type {Theme} from '../../../../utils/types';

export type PressableState = {
  pressed: boolean;
  disabled?: boolean;
};

export type PressableStyleArgs = {
  state: PressableState;
  stateLayerColor: string;
};

/**
 * Returns the state-layer overlay style for a given pressable state.
 *
 * The overlay is a transparent color with `theme.colors.pressedStateOpacity`.
 * It is the ONLY visual the Pressable primitive contributes; padding,
 * radius, background, etc. come from the consumer's outer style.
 * `focusStateOpacity` / `hoverStateOpacity` tokens still exist for
 * future consumer-driven focus/hover branches; the primitive itself
 * does not surface those states on mobile.
 */
export const createStateLayerStyle = (
  theme: Theme,
  {state, stateLayerColor}: PressableStyleArgs,
) => {
  if (state.disabled || !state.pressed) {
    return null;
  }

  const opacity = theme.colors.pressedStateOpacity;
  if (opacity === null || opacity === undefined) {
    return null;
  }

  return {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: stateLayerColor,
    opacity,
  } as const;
};
