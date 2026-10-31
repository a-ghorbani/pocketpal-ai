import type {KeyboardEventEasing} from 'react-native';
import {ANIMATION_CONFIGS, KEYBOARD_STATUS} from '@gorhom/bottom-sheet';
import {
  Easing,
  type WithSpringConfig,
  type WithTimingConfig,
} from 'react-native-reanimated';

import type {KeyboardState} from './gorhomInternal';

const BAR_PADDING = 10;
const LIFT_MARGIN = 1;

type KeyboardCover = Pick<KeyboardState, 'heightWithinContainer'> & {
  lifted: boolean;
};

export type PaddingInputs = KeyboardCover &
  Pick<KeyboardState, 'easing' | 'duration'> & {inset: number};

export type PaddingUpdate =
  | {value: number; method: 'none' | 'set'}
  | {value: number; method: 'timing'; config: WithTimingConfig}
  | {value: number; method: 'spring'; config: WithSpringConfig};

export const isLifted = (
  status: KeyboardState['status'],
  position: number,
  highestDetentPosition: number | undefined,
) => {
  'worklet';
  return (
    status === KEYBOARD_STATUS.SHOWN &&
    highestDetentPosition !== undefined &&
    position < highestDetentPosition - LIFT_MARGIN
  );
};

export const actionsBottomPadding = (
  insetBottom: number,
  {lifted, heightWithinContainer}: KeyboardCover,
) => {
  'worklet';
  const covered = lifted ? heightWithinContainer : 0;
  return BAR_PADDING + Math.max(0, insetBottom - covered);
};

export const keyboardAnimationConfig = (
  easing: KeyboardEventEasing,
  duration: number,
): WithTimingConfig | WithSpringConfig => {
  'worklet';
  switch (easing) {
    case 'easeIn':
      return {easing: Easing.in(Easing.ease), duration};
    case 'easeOut':
      return {easing: Easing.out(Easing.ease), duration};
    case 'easeInEaseOut':
      return {easing: Easing.inOut(Easing.ease), duration};
    case 'linear':
      return {easing: Easing.linear, duration};
    case 'keyboard':
      return {
        damping: 500,
        stiffness: 1000,
        mass: 3,
        overshootClamping: true,
      };
  }
  return ANIMATION_CONFIGS;
};

export const paddingUpdate = (
  prev: PaddingInputs | null,
  next: PaddingInputs,
): PaddingUpdate => {
  'worklet';
  const value = actionsBottomPadding(next.inset, next);
  if (prev === null) {
    return {value, method: 'set'};
  }
  const keyboardMoved =
    prev.lifted !== next.lifted ||
    prev.heightWithinContainer !== next.heightWithinContainer;
  if (prev.inset !== next.inset && !keyboardMoved) {
    return {value, method: 'set'};
  }
  if (value === actionsBottomPadding(prev.inset, prev)) {
    return {value, method: 'none'};
  }
  const config = keyboardAnimationConfig(next.easing, next.duration);
  return 'duration' in config || 'easing' in config
    ? {value, method: 'timing', config: config as WithTimingConfig}
    : {value, method: 'spring', config: config as WithSpringConfig};
};
