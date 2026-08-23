import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.colors.surface,
    },
    container: {
      padding: 16,
    },
    card: {
      marginVertical: 8,
      borderRadius: 12,
      backgroundColor: theme.colors.background,
    },
    switchRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginVertical: 8,
    },
    textColumn: {
      flex: 1,
      marginRight: 16,
    },
    description: {
      color: theme.colors.onSurfaceVariant,
      marginTop: 2,
    },
    sectionLabel: {
      color: theme.colors.onSurface,
      marginTop: 16,
      marginBottom: 4,
    },
    divider: {
      marginVertical: 8,
    },
    rowWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 8,
      marginTop: 8,
    },
    chip: {
      borderRadius: 8,
    },
    progressBar: {
      marginVertical: 8,
    },
    spinner: {
      marginVertical: 12,
    },
    button: {
      marginTop: 12,
      borderRadius: 8,
    },
    errorText: {
      color: theme.colors.error,
      marginTop: 8,
    },
    indexingBox: {
      marginBottom: 12,
    },
    emptyBox: {
      alignItems: 'center',
      paddingVertical: 24,
    },
    docRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.outline,
    },
    deleteLabel: {
      color: theme.colors.error,
    },
    chunkBox: {
      flexDirection: 'row',
      gap: 8,
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.outline,
    },
    chunkIndex: {
      color: theme.colors.primary,
      minWidth: 24,
    },
  });
