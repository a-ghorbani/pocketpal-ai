import {StyleSheet} from 'react-native';

import type {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    content: {
      padding: 16,
      gap: 12,
    },
    actions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    card: {
      backgroundColor: theme.colors.surface,
    },
    cardRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    endpoint: {
      color: theme.colors.onSurfaceVariant,
      fontFamily: 'monospace',
      fontSize: 12,
    },
    badges: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 6,
    },
    badge: {
      color: theme.colors.onSurfaceVariant,
      fontSize: 11,
      borderWidth: 1,
      borderColor: theme.colors.outline,
      borderRadius: 4,
      paddingHorizontal: 6,
      paddingVertical: 2,
      overflow: 'hidden',
    },
    badgeWarning: {
      color: theme.colors.error,
      borderColor: theme.colors.error,
    },
    empty: {
      gap: 6,
    },
    emptyHint: {
      color: theme.colors.onSurfaceVariant,
    },
    notice: {
      color: theme.colors.onSurfaceVariant,
    },
  });
