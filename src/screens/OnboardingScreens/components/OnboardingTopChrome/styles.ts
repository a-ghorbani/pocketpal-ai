import {StyleSheet} from 'react-native';

import type {Theme} from '../../../../utils/types';

export const createStyles = (theme: Theme, topInset: number) =>
  StyleSheet.create({
    root: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 10,
    },
    band: {
      height: topInset + 60,
      position: 'relative',
    },
    // Stepper sits 30pt below the safe-area inset, horizontally centered
    // on the screen frame. Slot is non-interactive so taps fall through
    // to whatever sits underneath in that band.
    stepperSlot: {
      position: 'absolute',
      top: topInset + 30,
      left: 0,
      right: 0,
      alignItems: 'center',
    },
    stepperOverride: {
      alignSelf: 'center',
    },
    topRightSlot: {
      position: 'absolute',
      top: topInset + 16,
      right: 16,
    },
  });
