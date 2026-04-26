import {StyleSheet} from 'react-native';

import {useTheme} from '../../hooks';

export const createStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    scrollContent: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      gap: 8,
    },
    chip: {
      maxWidth: 260,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.outline,
      // Opaque so chips read cleanly over content scrolling beneath them.
      backgroundColor: theme.colors.surface,
    },
    chipPressed: {
      opacity: 0.6,
    },
    chipDisabled: {
      opacity: 0.4,
    },
    chipText: {
      fontSize: 13,
      color: theme.colors.onSurface,
    },
  });
