import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

// Minimum tap target per Apple/Material (≥44pt).
const MIN_TAP = 44;

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    gearOnly: {
      width: MIN_TAP,
      height: MIN_TAP,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: MIN_TAP / 2,
      backgroundColor: theme.colors.surfaceContainerLow,
    },
    split: {
      flexDirection: 'row',
      alignItems: 'stretch',
      height: MIN_TAP,
      borderRadius: MIN_TAP / 2,
      backgroundColor: theme.colors.surfaceContainerLow,
      overflow: 'hidden',
    },
    half: {
      minWidth: MIN_TAP,
      height: MIN_TAP,
      paddingHorizontal: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    leftHalf: {
      maxWidth: 200,
    },
    rightHalf: {
      width: MIN_TAP,
    },
    divider: {
      width: 1,
      backgroundColor: theme.colors.onSurfaceVariant,
      opacity: 0.25,
    },
    voiceLabel: {
      marginLeft: 6,
      color: theme.colors.onSurface,
    },
  });
