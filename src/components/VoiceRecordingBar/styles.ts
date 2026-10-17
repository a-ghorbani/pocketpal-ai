import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

const BAR_MAX_HEIGHT = 24;

export const BAR_MIN_HEIGHT = 3;
export const BAR_RANGE = BAR_MAX_HEIGHT - BAR_MIN_HEIGHT;

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 10,
      gap: 12,
      minHeight: 36,
    },
    circleButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceVariant,
    },
    stopSquare: {
      width: 12,
      height: 12,
      borderRadius: 2,
      backgroundColor: theme.colors.onSurface,
    },
    bars: {
      flex: 1,
      height: BAR_MAX_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 3,
      overflow: 'hidden',
    },
    bar: {
      width: 3,
      borderRadius: 1.5,
      backgroundColor: theme.colors.onSurfaceVariant,
    },
    timer: {
      minWidth: 36,
      textAlign: 'right',
      color: theme.colors.onSurfaceVariant,
      fontVariant: ['tabular-nums'],
    },
    timerWarning: {
      color: theme.colors.error,
    },
    transcribingText: {
      flex: 1,
      textAlign: 'center',
      color: theme.colors.onSurfaceVariant,
    },
  });
