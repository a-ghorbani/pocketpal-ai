import {StyleSheet} from 'react-native';

export const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      padding: 16,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    title: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.colors.onSurface,
    },
    summary: {
      fontSize: 13,
      color: theme.colors.onSurfaceVariant,
      marginBottom: 8,
    },
    actionsRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 12,
    },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 8,
      backgroundColor: theme.colors.surfaceVariant,
      marginBottom: 8,
    },
    itemIcon: {
      marginRight: 12,
    },
    itemInfo: {
      flex: 1,
    },
    itemName: {
      fontSize: 14,
      fontWeight: '500',
      color: theme.colors.onSurface,
    },
    itemStatus: {
      fontSize: 12,
      color: theme.colors.onSurfaceVariant,
      marginTop: 2,
    },
    itemActions: {
      flexDirection: 'row',
      gap: 4,
    },
    iconButton: {
      padding: 6,
    },
    progressBar: {
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.colors.outline,
      marginTop: 6,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      borderRadius: 2,
      backgroundColor: theme.colors.primary,
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 48,
    },
    emptyText: {
      fontSize: 14,
      color: theme.colors.onSurfaceVariant,
      marginTop: 8,
    },
    errorText: {
      fontSize: 12,
      color: theme.colors.error,
      marginTop: 4,
    },
  });
