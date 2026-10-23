import * as React from 'react';
import {GestureResponderEvent} from 'react-native';

import type {PressPointEvent} from '../utils/types';

const LONG_PRESS_DELAY_MS = 500;
const LONG_PRESS_MOVE_TOLERANCE = 10;

type TouchLongPressHandlers = {
  onLongPress: (event: PressPointEvent) => void;
  canStart?: () => boolean;
  onPressIn?: () => void;
  onPressOut?: () => void;
};

/**
 * A long-press built on raw touch events, so the view never becomes the JS
 * responder: on Android the responder's view intercepts the rest of the
 * gesture, which stops a native scroll view inside it from scrolling.
 */
export const useTouchLongPress = ({
  onLongPress,
  canStart,
  onPressIn,
  onPressOut,
}: TouchLongPressHandlers) => {
  const start = React.useRef<PressPointEvent['nativeEvent'] | undefined>(
    undefined,
  );
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const pressed = React.useRef(false);

  const clearHold = React.useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    start.current = undefined;
  }, []);

  const release = React.useCallback(() => {
    clearHold();
    if (pressed.current) {
      pressed.current = false;
      onPressOut?.();
    }
  }, [clearHold, onPressOut]);

  React.useEffect(() => clearHold, [clearHold]);

  return React.useMemo(
    () => ({
      onTouchStart: ({nativeEvent: {pageX, pageY}}: GestureResponderEvent) => {
        release();
        if (canStart && !canStart()) {
          return;
        }
        const point = {pageX, pageY};
        start.current = point;
        pressed.current = true;
        onPressIn?.();
        timer.current = setTimeout(() => {
          clearHold();
          onLongPress({nativeEvent: point});
        }, LONG_PRESS_DELAY_MS);
      },
      onTouchMove: ({nativeEvent: {pageX, pageY}}: GestureResponderEvent) => {
        const from = start.current;
        if (
          from &&
          Math.hypot(pageX - from.pageX, pageY - from.pageY) >
            LONG_PRESS_MOVE_TOLERANCE
        ) {
          release();
        }
      },
      onTouchEnd: release,
      onTouchCancel: release,
    }),
    [canStart, clearHold, onLongPress, onPressIn, release],
  );
};
