import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      padding: 16,
      paddingBottom: 32,
    },
    section: {
      marginBottom: 24,
    },
    sectionHeader: {
      fontWeight: 'bold',
      marginBottom: 4,
      color: theme.colors.onSurface,
    },
    sectionDescription: {
      marginBottom: 12,
      color: theme.colors.onSurfaceVariant,
    },
    installPlaceholder: {
      padding: 12,
      marginBottom: 12,
      borderRadius: 8,
      backgroundColor: theme.colors.surfaceContainerLow,
    },
    installPlaceholderText: {
      color: theme.colors.onSurfaceVariant,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      paddingHorizontal: 4,
      minHeight: 44,
    },
    rowDisabled: {
      opacity: 0.45,
    },
    rowVoiceName: {
      flex: 1,
      color: theme.colors.onSurface,
    },
    rowVoiceNameSelected: {
      fontWeight: 'bold',
    },
    previewButton: {
      marginLeft: 8,
    },
    emptyText: {
      padding: 12,
      color: theme.colors.onSurfaceVariant,
      fontStyle: 'italic',
    },
  });
