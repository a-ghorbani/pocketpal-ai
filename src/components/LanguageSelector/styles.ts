import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    // Content-sized: no width, so a long endonym is never clipped.
    trigger: {
      flexDirection: 'row',
      alignItems: 'center',
      flexShrink: 1,
      gap: 8,
      minHeight: 44,
      paddingHorizontal: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.outlineVariant,
      backgroundColor: theme.colors.surface,
    },
    triggerLabel: {
      flexShrink: 1,
      color: theme.colors.onSurface,
      fontSize: 16,
    },
  });
