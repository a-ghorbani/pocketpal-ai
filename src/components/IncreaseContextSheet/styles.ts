import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      gap: 14,
    },
    body: {
      color: theme.colors.onSurfaceVariant,
    },
    pickHead: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      marginTop: 4,
    },
    pickVal: {
      color: theme.colors.onSurface,
      fontVariant: ['tabular-nums'],
    },
    pickUnit: {
      color: theme.colors.onSurfaceVariant,
    },
    pickSub: {
      color: theme.colors.onSurfaceVariant,
      marginTop: 4,
    },
    fitChip: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
    },
    fitChipText: {
      fontSize: 11,
      fontWeight: '700' as const,
      letterSpacing: 0.2,
    },
    sliderWrap: {
      marginTop: 4,
    },
    slider: {
      width: '100%',
      height: 36,
    },
    sliderEnds: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 4,
    },
    sliderEndsText: {
      color: theme.colors.onSurfaceVariant,
      fontVariant: ['tabular-nums'],
    },
    statusLine: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 8,
      minHeight: 40,
      justifyContent: 'center',
    },
    statusText: {
      color: theme.colors.onSurfaceVariant,
    },
    hedge: {
      color: theme.colors.onSurfaceVariant,
      fontStyle: 'italic' as const,
    },
    advancedToggle: {
      paddingVertical: 6,
    },
    advancedToggleText: {
      color: theme.colors.onSurfaceVariant,
      fontWeight: '600' as const,
    },
    advancedBody: {
      color: theme.colors.onSurfaceVariant,
      lineHeight: 18,
    },
    noFitBody: {
      color: theme.colors.onSurfaceVariant,
      lineHeight: 20,
    },
    actions: {
      flexDirection: 'row',
      gap: 8,
    },
    button: {
      flex: 1,
    },
  });
