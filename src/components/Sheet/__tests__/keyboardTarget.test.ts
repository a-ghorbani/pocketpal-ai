import {KEYBOARD_STATUS} from '@gorhom/bottom-sheet';

import type {KeyboardState} from '../gorhomInternal';
import {clearOwnKeyboardTarget, setKeyboardTarget} from '../keyboardTarget';

const OWN_TAG = 42;
const OTHER_TAG = 7;

const keyboard = (target?: number): KeyboardState => ({
  target,
  status: KEYBOARD_STATUS.SHOWN,
  height: 300,
  heightWithinContainer: 280,
  easing: 'keyboard',
  duration: 250,
});

const withoutTarget = ({target: _, ...rest}: KeyboardState) => rest;

describe('keyboard target updates', () => {
  it.each([
    ['replaces a held target', OTHER_TAG],
    ['sets an empty target', undefined],
  ])('set %s and keeps every other field', (_, held) => {
    const state = keyboard(held);

    const next = setKeyboardTarget(state, OWN_TAG);

    expect(next.target).toBe(OWN_TAG);
    expect(withoutTarget(next)).toEqual(withoutTarget(state));
  });

  it('clear-if-own unsets its own target and keeps every other field', () => {
    const state = keyboard(OWN_TAG);

    const next = clearOwnKeyboardTarget(state, OWN_TAG);

    expect(next.target).toBeUndefined();
    expect(withoutTarget(next)).toEqual(withoutTarget(state));
  });

  it("clear-if-own returns another input's state unchanged", () => {
    const state = keyboard(OTHER_TAG);

    expect(clearOwnKeyboardTarget(state, OWN_TAG)).toBe(state);
  });
});
