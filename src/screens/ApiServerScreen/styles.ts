import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    scrollContent: {
      padding: 16,
      gap: 16,
    },
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      padding: 16,
      gap: 12,
    },
    sectionTitle: {
      color: theme.colors.onBackground,
      fontWeight: '600',
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    statusDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    statusDotRunning: {
      backgroundColor: theme.colors.primary,
    },
    statusDotStopped: {
      backgroundColor: theme.colors.onSurfaceVariant,
    },
    statusText: {
      color: theme.colors.onSurface,
      flex: 1,
    },
    urlRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    urlText: {
      color: theme.colors.onSurface,
      fontFamily: 'monospace',
      fontSize: 13,
      flex: 1,
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
    rowLabel: {
      color: theme.colors.onBackground,
    },
    apiKeyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    apiKeyText: {
      flex: 1,
      color: theme.colors.onSurface,
      fontFamily: 'monospace',
      fontSize: 12,
    },
    iconButton: {
      padding: 4,
    },
    errorText: {
      color: theme.colors.error,
      fontSize: 13,
    },
    noteText: {
      color: theme.colors.onSurfaceVariant,
      fontSize: 13,
    },
    logEntry: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.outlineVariant,
      paddingBottom: 8,
      gap: 2,
    },
    logMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    logMethod: {
      color: theme.colors.onSurface,
      fontFamily: 'monospace',
      fontSize: 12,
    },
    logStatusOk: {
      color: theme.colors.primary,
      fontFamily: 'monospace',
      fontSize: 12,
    },
    logStatusError: {
      color: theme.colors.error,
      fontFamily: 'monospace',
      fontSize: 12,
    },
    logPath: {
      color: theme.colors.onSurfaceVariant,
      fontFamily: 'monospace',
      fontSize: 12,
    },
    emptyText: {
      color: theme.colors.onSurfaceVariant,
    },
    actionsRow: {
      flexDirection: 'row',
      gap: 12,
    },
    spacer: {
      flex: 1,
    },
    input: {
      width: 120,
    },
  });
