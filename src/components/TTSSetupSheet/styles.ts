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
    installCard: {
      padding: 12,
      marginBottom: 12,
      borderRadius: 8,
      backgroundColor: theme.colors.surfaceContainerLow,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      overflow: 'hidden',
      position: 'relative',
    },
    installCardBody: {
      flex: 1,
      paddingRight: 12,
    },
    installCardTitle: {
      color: theme.colors.onSurface,
      fontWeight: '600',
    },
    installCardSubtitle: {
      color: theme.colors.onSurfaceVariant,
      marginTop: 2,
      fontSize: 12,
    },
    installCardProgressFill: {
      position: 'absolute',
      top: 0,
      left: 0,
      bottom: 0,
      backgroundColor: theme.colors.primaryContainer,
      opacity: 0.5,
    },
    installCardError: {
      backgroundColor: theme.colors.errorContainer,
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
