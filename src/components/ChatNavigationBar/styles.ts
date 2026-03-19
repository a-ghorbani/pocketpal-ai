import {StyleSheet} from 'react-native';
import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      position: 'absolute',
      right: 2,
      top: 8,
      // bottom is set dynamically via bottomOffset prop
      width: 28,
      alignItems: 'center',
      justifyContent: 'space-between',
      zIndex: 50,
    },
    navButton: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: theme.colors.surfaceVariant,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.colors.outlineVariant,
    },
    navButtonText: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.onSurfaceVariant,
      lineHeight: 16,
    },
    trackContainer: {
      flex: 1,
      width: 6,
      marginVertical: 6,
      borderRadius: 3,
      backgroundColor: theme.colors.surfaceVariant,
      overflow: 'hidden',
      position: 'relative',
    },
    trackFill: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      backgroundColor: theme.colors.primary,
      opacity: 0.3,
      borderRadius: 3,
    },
    nodeMarker: {
      position: 'absolute',
      left: 0,
      right: 0,
      height: 3,
      backgroundColor: theme.colors.primary,
      borderRadius: 1.5,
    },
    thumbIndicator: {
      position: 'absolute',
      left: -2,
      width: 10,
      minHeight: 8,
      borderRadius: 5,
      backgroundColor: theme.colors.primary,
      opacity: 0.7,
    },
  });
