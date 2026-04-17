import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

// Split-pill: speaker half (toggle auto-speak / stop playback) + hairline
// divider + chevron half (open setup sheet). Collapses to a dimmed icon-only
// state when auto-speak is OFF so it doesn't compete visually with send.
export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    pillContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 32,
      borderRadius: 16,
      overflow: 'hidden',
    },
    pillSpeakerHalf: {
      width: 38,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pillRightSide: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 32,
      overflow: 'hidden',
    },
    pillDivider: {
      width: 1,
      height: 18,
      backgroundColor: theme.colors.outline,
      opacity: 0.35,
    },
    pillSecondaryHalf: {
      width: 26,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
