import * as React from 'react';
import {GestureResponderEvent} from 'react-native';

import type {PressPointEvent} from '../utils/types';

const LONG_PRESS_DELAY_MS = 500;
const LONG_PRESS_MOVE_TOLERANCE = 10;

/**
 * A long-press built on raw touch events, so the view never becomes the JS
 * responder: on Android the responder's view intercepts the rest of the
 * gesture, which stops a native scroll view inside it from scrolling.
 */
export const useTouchLongPress = (
  onLongPress: (event: PressPointEvent) => void,
) => {
  const start = React.useRef<PressPointEvent['nativeEvent'] | undefined>(
    undefined,
  );
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const cancel = React.useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    start.current = undefined;
  }, []);

  React.useEffect(() => cancel, [cancel]);

  return React.useMemo(
    () => ({
      onTouchStart: ({nativeEvent: {pageX, pageY}}: GestureResponderEvent) => {
        cancel();
        const point = {pageX, pageY};
        start.current = point;
        timer.current = setTimeout(() => {
          cancel();
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
          cancel();
        }
      },
      onTouchEnd: cancel,
      onTouchCancel: cancel,
    }),
    [cancel, onLongPress],
  );
};
