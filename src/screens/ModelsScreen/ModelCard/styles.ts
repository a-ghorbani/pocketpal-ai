import {StyleSheet} from 'react-native';

import {Theme} from '../../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      borderRadius: theme.radius.l,
      margin: theme.spacing.xs,
      backgroundColor: theme.colors.background,
      borderColor: theme.colors.outline,
      borderWidth: theme.stroke.sm,
    },
    statusBadges: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.s,
      paddingHorizontal: theme.spacing.ml,
      paddingBottom: theme.spacing.s,
    },
    cardContent: {
      paddingBottom: theme.spacing.xs,
      paddingTop: 0,
    },
    downloadProgressContainer: {
      marginHorizontal: theme.spacing.m,
      marginTop: theme.spacing.xs,
      marginBottom: theme.spacing.sm,
    },
    progressBar: {
      height: theme.spacing.s,
      borderRadius: theme.radius.xs,
    },
    downloadSpeed: {
      ...theme.typography.uiS,
      textAlign: 'right',
      marginTop: theme.spacing.xs,
    },
    warningContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      marginBottom: 12,
    },
    warningContent: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
    },
    warningIcon: {
      margin: 0,
    },
    warningText: {
      color: theme.colors.error,
      fontSize: 12,
      flex: 1,
      flexWrap: 'wrap',
    },
    visionToggleContainer: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.ml,
      padding: theme.spacing.sm,
      gap: theme.spacing.s,
    },
    compactHeader: {
      paddingHorizontal: theme.spacing.m,
      paddingVertical: theme.spacing.sm,
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
      gap: theme.spacing.s,
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.s,
    },
    modelTypeIcon: {
      flexShrink: 0,
    },
    compactModelName: {
      ...theme.typography.titleS,
      color: theme.colors.onSurface,
      flex: 1,
    },
    sizeInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      marginRight: theme.spacing.s,
    },
    sizeInfoText: {
      ...theme.typography.uiS,
      color: theme.colors.onSurfaceVariant,
      marginLeft: theme.spacing.xs,
    },
    serverLink: {
      flexDirection: 'row',
      alignItems: 'center',
      marginRight: theme.spacing.s,
    },
    serverLinkText: {
      ...theme.typography.uiS,
      color: theme.colors.primary,
      marginLeft: theme.spacing.xs,
      textDecorationLine: 'underline',
    },
    statusDot: {
      width: theme.spacing.s,
      height: theme.spacing.s,
      borderRadius: theme.radius.xs,
    },
    detailsContent: {
      paddingHorizontal: theme.spacing.m,
      paddingBottom: theme.spacing.m,
      gap: theme.spacing.sm,
    },
    descriptionContainer: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.ml,
      padding: theme.spacing.sm,
    },
    descriptionText: {
      ...theme.typography.uiM,
      color: theme.colors.onSurface,
    },
    technicalDetailsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.s,
    },
    technicalDetailCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.ml,
      padding: theme.spacing.s,
      flex: 1,
      minWidth: '45%',
    },
    technicalDetailLabel: {
      ...theme.typography.uiS,
      color: theme.colors.onSurfaceVariant,
      marginBottom: theme.spacing.xxs,
    },
    technicalDetailValue: {
      ...theme.typography.uiM,
      color: theme.colors.onSurface,
    },
    hfLinkButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.sm,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.ml,
      borderWidth: theme.stroke.sm,
      borderColor: theme.colors.primaryContainer,
    },
    hfLinkContent: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    hfLinkText: {
      ...theme.typography.uiS,
      color: theme.colors.primary,
      marginLeft: theme.spacing.s,
    },
    // Action buttons section
    actionButtonsContainer: {
      paddingHorizontal: theme.spacing.m,
      paddingBottom: theme.spacing.sm,
    },
    actionButtonsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.s,
    },
    primaryActionButton: {
      flex: 1,
      borderRadius: theme.radius.m,
      minHeight: 40,
    },
    buttonContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing.s,
    },
    buttonLabel: {
      ...theme.typography.uiM,
      color: theme.colors.onSecondaryContainer,
    },
    buttonLabelDisabled: {
      color: theme.colors.onSurfaceVariant,
    },
    iconButton: {
      padding: theme.spacing.s,
      borderRadius: theme.radius.m,
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
      gap: theme.spacing.s,
      flex: 1,
    },
    visionToggleLabel: {
      ...theme.typography.uiM,
      color: theme.colors.onSurface,
    },
    visionHelpText: {
      ...theme.typography.uiS,
      color: theme.colors.onSurfaceVariant,
      fontStyle: 'italic',
    },
    projectionModelsContainer: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.ml,
      padding: theme.spacing.sm,
    },
    warningButton: {
      paddingVertical: theme.spacing.xs,
      paddingHorizontal: theme.spacing.s,
      backgroundColor: theme.colors.errorContainer,
      borderRadius: theme.radius.s,
      marginTop: theme.spacing.s,
    },
    warningButtonText: {
      ...theme.typography.uiS,
      color: theme.colors.onErrorContainer,
      textAlign: 'center',
    },
    storageErrorText: {
      marginHorizontal: theme.spacing.ml,
    },
    fullModelNameContainer: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.ml,
      padding: theme.spacing.sm,
    },
    fullModelNameLabel: {
      ...theme.typography.uiS,
      color: theme.colors.onSurfaceVariant,
      marginBottom: theme.spacing.xs,
    },
    fullModelNameText: {
      ...theme.typography.uiM,
      color: theme.colors.onSurface,
    },
  });
