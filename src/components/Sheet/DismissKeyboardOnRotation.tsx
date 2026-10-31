import {useEffect, useRef} from 'react';
import {Keyboard} from 'react-native';
import {useBottomSheetInternal} from '@gorhom/bottom-sheet';

import {useScreenHeight} from './screenSize';

// gorhom sizes a lift only on keyboard events, against the pre-rotation container,
// so a rotation mid-lift leaves the sheet sized for the old keyboard.
export const DismissKeyboardOnRotation = () => {
  const sheet = useBottomSheetInternal(true);
  const screenHeight = useScreenHeight();
  const handledScreenHeight = useRef(screenHeight);

  useEffect(() => {
    if (screenHeight === handledScreenHeight.current) {
      return;
    }
    handledScreenHeight.current = screenHeight;
    if (sheet?.animatedKeyboardState.get().target) {
      Keyboard.dismiss();
    }
  }, [screenHeight, sheet]);

  return null;
};
