import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
      padding: 16,
      gap: 16,
    },
    controls: {
      gap: 12,
    },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 4,
    },
    switchLabel: {
      color: theme.colors.onBackground,
      flex: 1,
      marginRight: 8,
    },
    categoryGroup: {
      paddingLeft: 12,
      gap: 4,
    },
    buttonRow: {
      flexDirection: 'row',
      gap: 12,
    },
    logContainer: {
      flex: 1,
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
    },
    logContent: {
      padding: 12,
      gap: 12,
    },
    emptyText: {
      color: theme.colors.onSurfaceVariant,
    },
    logEntry: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.outlineVariant,
      paddingBottom: 10,
      gap: 4,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    metaText: {
      color: theme.colors.onSurfaceVariant,
      fontSize: 12,
      flex: 1,
    },
    expandButton: {
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    expandButtonText: {
      color: theme.colors.primary,
      fontSize: 12,
    },
    messageText: {
      color: theme.colors.onSurface,
      fontFamily: 'monospace',
      fontSize: 12,
    },
  });
