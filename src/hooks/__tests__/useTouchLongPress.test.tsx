import * as React from 'react';
import {View} from 'react-native';

import {act, fireEvent, render} from '@testing-library/react-native';

import {useTouchLongPress} from '../useTouchLongPress';

const Target = ({onLongPress}: {onLongPress: jest.Mock}) => (
  <View testID="target" {...useTouchLongPress(onLongPress)} />
);

const touch = (pageX: number, pageY: number) => ({nativeEvent: {pageX, pageY}});

describe('useTouchLongPress', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const setup = () => {
    const onLongPress = jest.fn();
    const utils = render(<Target onLongPress={onLongPress} />);
    return {onLongPress, target: utils.getByTestId('target'), ...utils};
  };

  const wait = (ms: number) =>
    act(() => {
      jest.advanceTimersByTime(ms);
    });

  it('gives the view no responder handlers', () => {
    const {target} = setup();

    expect(target.props.onStartShouldSetResponder).toBeUndefined();
    expect(target.props.onResponderGrant).toBeUndefined();
  });

  it('fires once after a 500 ms hold with the touch-start point', () => {
    const {onLongPress, target} = setup();
    const start: {nativeEvent: unknown} = touch(3, 4);

    fireEvent(target, 'touchStart', start);
    start.nativeEvent = null;
    wait(499);
    expect(onLongPress).not.toHaveBeenCalled();
    wait(1);

    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(onLongPress).toHaveBeenCalledWith(touch(3, 4));
  });

  it('still fires when the finger drifts within 10 px', () => {
    const {onLongPress, target} = setup();

    fireEvent(target, 'touchStart', touch(0, 0));
    fireEvent(target, 'touchMove', touch(6, 8));
    wait(500);

    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a drag past 10 px', 'touchMove', touch(11, 0)],
    ['a release', 'touchEnd', touch(0, 0)],
    ['a cancelled touch', 'touchCancel', touch(0, 0)],
  ])('does not fire after %s', (_case, eventName, event) => {
    const {onLongPress, target} = setup();

    fireEvent(target, 'touchStart', touch(0, 0));
    fireEvent(target, eventName, event);
    wait(500);

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('does not fire after unmount', () => {
    const {onLongPress, target, unmount} = setup();

    fireEvent(target, 'touchStart', touch(0, 0));
    unmount();
    wait(500);

    expect(onLongPress).not.toHaveBeenCalled();
  });
});
