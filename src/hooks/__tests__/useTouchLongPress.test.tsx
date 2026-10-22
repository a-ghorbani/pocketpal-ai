import * as React from 'react';
import {View} from 'react-native';

import {act, fireEvent, render} from '@testing-library/react-native';

import {useTouchLongPress} from '../useTouchLongPress';

type Handlers = {
  onLongPress: jest.Mock;
  onPressIn?: jest.Mock;
  onPressOut?: jest.Mock;
};

const Target = (handlers: Handlers) => (
  <View testID="target" {...useTouchLongPress(handlers)} />
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

  it.each([
    ['a release', 'touchEnd', touch(0, 0)],
    ['a drag past 10 px', 'touchMove', touch(0, 11)],
    ['a cancelled touch', 'touchCancel', touch(0, 0)],
  ])(
    'presses in on touch start and out once on %s',
    (_case, eventName, event) => {
      const onPressIn = jest.fn();
      const onPressOut = jest.fn();
      const {getByTestId} = render(
        <Target
          onLongPress={jest.fn()}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
        />,
      );
      const target = getByTestId('target');

      fireEvent(target, 'touchStart', touch(0, 0));
      expect(onPressIn).toHaveBeenCalledTimes(1);
      expect(onPressOut).not.toHaveBeenCalled();
      fireEvent(target, eventName, event);
      fireEvent(target, 'touchEnd', touch(0, 0));

      expect(onPressOut).toHaveBeenCalledTimes(1);
    },
  );

  it('stays pressed through a long-press until release', () => {
    const onLongPress = jest.fn();
    const onPressOut = jest.fn();
    const {getByTestId} = render(
      <Target onLongPress={onLongPress} onPressOut={onPressOut} />,
    );
    const target = getByTestId('target');

    fireEvent(target, 'touchStart', touch(0, 0));
    wait(500);
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(onPressOut).not.toHaveBeenCalled();
    fireEvent(target, 'touchEnd', touch(0, 0));

    expect(onPressOut).toHaveBeenCalledTimes(1);
  });

  it('does not fire after unmount', () => {
    const {onLongPress, target, unmount} = setup();

    fireEvent(target, 'touchStart', touch(0, 0));
    unmount();
    wait(500);

    expect(onLongPress).not.toHaveBeenCalled();
  });
});
