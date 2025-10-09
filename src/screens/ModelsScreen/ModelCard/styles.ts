import {StyleSheet} from 'react-native';

import {Theme} from '../../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      borderRadius: 24, // Updated to match rounded-3xl (24px)
      margin: 6,
      //overflow: 'hidden',
      backgroundColor: theme.colors.background,
      borderColor: theme.colors.outline,
      borderWidth: 1,
    },
    cardContent: {
      paddingVertical: 6,
      //paddingHorizontal: 12,
    },
    downloadProgressContainer: {
      marginHorizontal: 18,
      marginTop: 6,
      marginBottom: 12,
    },
    progressBar: {
      height: 8,
      borderRadius: 5,
    },
    downloadSpeed: {
      textAlign: 'right',
      fontSize: 12,
      marginTop: 4,
    },
    warningContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      margin: 0,
      marginTop: 6,
    },
    warningContent: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
    },
    warningIcon: {
      marginLeft: 0,
      marginRight: 2,
    },
    warningText: {
      color: theme.colors.error,
      fontSize: 12,
      flex: 1,
      flexWrap: 'wrap',
    },
    visionToggleContainer: {
      backgroundColor: theme.colors.surface,
      borderRadius: 16,
      padding: 12,
      gap: 8,
    },
    compactHeader: {
      paddingHorizontal: 18,
      paddingVertical: 12,
    },
    headerContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      minWidth: 0,
      gap: 10,
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    modelTypeIcon: {
      flexShrink: 0,
    },
    compactModelName: {
      //fontSize: 16,
      //fontWeight: '600',
      color: theme.colors.onSurface,
      flex: 1,
    },
    sizeInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      marginRight: 8,
    },
    sizeInfoText: {
      fontSize: 12,
      color: theme.colors.onSurfaceVariant,
      marginLeft: 4,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    detailsContent: {
      paddingHorizontal: 18,
      paddingBottom: 18,
      gap: 12,
    },
    descriptionContainer: {
      backgroundColor: theme.colors.surface,
      borderRadius: 16, // rounded-2xl
      padding: 12,
    },
    descriptionText: {
      fontSize: 14,
      color: theme.colors.onSurface,
      lineHeight: 20, // leading-relaxed
    },
    technicalDetailsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    technicalDetailCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: 16, // rounded-2xl
      padding: 10,
      flex: 1,
      minWidth: '45%', // Approximate 2-column grid
    },
    technicalDetailLabel: {
      fontSize: 12,
      color: theme.colors.onSurfaceVariant,
      marginBottom: 3,
    },
    technicalDetailValue: {
      fontSize: 14,
      fontWeight: '500',
      color: theme.colors.onSurface,
    },
    hfLinkButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      paddingHorizontal: 12,
      backgroundColor: theme.colors.surface,
      borderRadius: 16, // rounded-2xl
      borderWidth: 2,
      borderColor: theme.colors.primaryContainer,
    },
    hfLinkContent: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    hfLinkText: {
      fontSize: 12,
      color: theme.colors.primary,
      marginLeft: 8,
    },
    // Action buttons section
    actionButtonsContainer: {
      paddingHorizontal: 18,
      paddingBottom: 12,
    },
    actionButtonsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8, // gap-2 equivalent
    },
    primaryActionButton: {
      flex: 1,
      borderRadius: 16, // rounded-2xl
      borderWidth: 1,
      height: 40,
    },
    iconButton: {
      padding: 10, // p-2.5 equivalent
      borderRadius: 16, // rounded-2xl
      backgroundColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 40,
      minHeight: 40,
    },
    visionToggleHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    visionToggleLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flex: 1,
    },
    visionToggleLabel: {
      fontSize: 14,
      fontWeight: '500',
      color: theme.colors.onSurface,
    },
    visionHelpText: {
      fontSize: 11,
      color: theme.colors.onSurfaceVariant,
      fontStyle: 'italic',
    },
    projectionModelsContainer: {
      backgroundColor: theme.colors.surface,
      borderRadius: 16,
      padding: 12,
    },
    warningButton: {
      paddingVertical: 6,
      paddingHorizontal: 8,
      backgroundColor: theme.colors.errorContainer,
      borderRadius: 6,
      marginTop: 8,
    },
    warningButtonText: {
      fontSize: 12,
      color: theme.colors.onErrorContainer,
      textAlign: 'center',
    },
    storageErrorText: {
      marginHorizontal: 20,
    },
    fullModelNameContainer: {
      backgroundColor: theme.colors.surface,
      borderRadius: 16,
      padding: 12,
    },
    fullModelNameLabel: {
      fontSize: 12,
      color: theme.colors.onSurfaceVariant,
      marginBottom: 4,
      fontWeight: '500',
    },
    fullModelNameText: {
      fontSize: 14,
      color: theme.colors.onSurface,
      lineHeight: 20,
    },
  });
