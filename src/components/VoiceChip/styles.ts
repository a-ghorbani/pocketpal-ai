import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

// Primary (speaker) hit target ≥44pt. Secondary (gear/chevron) can be
// smaller — it's a subordinate option on the same compact control.
const MIN_TAP = 44;
const SECONDARY_TAP = 28;

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    // Compound pill: speaker + small secondary, grouped as one unit near send.
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      height: MIN_TAP,
      paddingRight: 4,
      borderRadius: MIN_TAP / 2,
    },
    speakerHalf: {
      width: MIN_TAP,
      height: MIN_TAP,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryHalf: {
      width: SECONDARY_TAP,
      height: SECONDARY_TAP,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: -4,
    },
  });
