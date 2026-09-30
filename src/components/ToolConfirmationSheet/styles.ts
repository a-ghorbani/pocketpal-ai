import {StyleSheet} from 'react-native';

import type {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      paddingHorizontal: 16,
      paddingBottom: 16,
      gap: 16,
    },
    description: {
      color: theme.colors.onSurface,
    },
    section: {
      gap: 4,
    },
    sectionLabel: {
      color: theme.colors.onSurfaceVariant,
      textTransform: 'uppercase',
    },
    monospace: {
      color: theme.colors.onSurface,
      fontFamily: 'monospace',
      fontSize: 12,
    },
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: 8,
    },
    declineButton: {
      marginRight: 4,
    },
  });
