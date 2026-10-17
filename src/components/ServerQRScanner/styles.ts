import {StyleSheet} from 'react-native';
import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      marginBottom: 16,
      borderRadius: 8,
      overflow: 'hidden',
      backgroundColor: theme.colors.surfaceVariant,
    },
    preview: {
      height: 240,
    },
    closeButton: {
      position: 'absolute',
      top: 4,
      right: 4,
    },
    message: {
      padding: 16,
      paddingRight: 56,
      color: theme.colors.onSurfaceVariant,
    },
    hint: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      color: theme.colors.error,
    },
    notReadyHint: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      color: theme.colors.onSurfaceVariant,
    },
  });
