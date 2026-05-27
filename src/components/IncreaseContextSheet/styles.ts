import {StyleSheet} from 'react-native';
import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      padding: 16,
      gap: 16,
    },
    body: {
      color: theme.colors.onSurface,
    },
    tierRow: {
      flexDirection: 'row',
      gap: 16,
    },
    tierColumn: {
      flex: 1,
      padding: 12,
      borderRadius: 12,
      backgroundColor: theme.colors.surfaceVariant,
      alignItems: 'center',
    },
    tierLabel: {
      color: theme.colors.onSurfaceVariant,
      marginBottom: 4,
    },
    tierValue: {
      color: theme.colors.onSurface,
      fontVariant: ['tabular-nums'],
    },
    hint: {
      color: theme.colors.onSurfaceVariant,
    },
    actions: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    button: {
      flex: 1,
    },
  });
