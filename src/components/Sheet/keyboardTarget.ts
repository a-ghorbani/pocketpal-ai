import {runOnUI} from 'react-native-reanimated';

import type {KeyboardState, KeyboardStateValue} from './gorhomInternal';

type KeyboardTargetUpdate = (
  state: KeyboardState,
  tag: number,
) => KeyboardState;

export const setKeyboardTarget: KeyboardTargetUpdate = (state, tag) => {
  'worklet';
  return {...state, target: tag};
};

export const clearOwnKeyboardTarget: KeyboardTargetUpdate = (state, tag) => {
  'worklet';
  return state.target === tag ? {...state, target: undefined} : state;
};

const applyKeyboardTargetUpdate = (
  keyboardState: KeyboardStateValue,
  update: KeyboardTargetUpdate,
  tag: number,
) => {
  'worklet';
  const state = keyboardState.get();
  const next = update(state, tag);
  if (next !== state) {
    keyboardState.set(next);
  }
};

export const updateKeyboardTarget = (
  keyboardState: KeyboardStateValue,
  update: KeyboardTargetUpdate,
  tag: number,
) => runOnUI(applyKeyboardTargetUpdate)(keyboardState, update, tag);
