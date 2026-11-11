import type {HostInstance} from 'react-native';

import {finiteNumber} from './finite';
import type {PressPointEvent} from './types';

/**
 * Calls `open` at the press point, or at the centre of `view` when the press
 * carries none: on Android a TalkBack, Switch Access or keyboard click
 * arrives with empty event data.
 */
export const openAtPressPoint = (
  event: PressPointEvent | undefined,
  view: HostInstance | null,
  open: (event: PressPointEvent) => void,
) => {
  const pageX = finiteNumber(event?.nativeEvent?.pageX);
  const pageY = finiteNumber(event?.nativeEvent?.pageY);
  if (pageX !== undefined && pageY !== undefined) {
    open({nativeEvent: {pageX, pageY}});
    return;
  }
  view?.measure((_x, _y, width, height, viewX, viewY) =>
    open({nativeEvent: {pageX: viewX + width / 2, pageY: viewY + height / 2}}),
  );
};
