import {Dimensions, StyleSheet} from 'react-native';

import {Theme} from '../../../utils/types';

const screenHeight = Dimensions.get('window').height;

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      padding: theme.spacing.m,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.m,
    },
    chatTemplateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: theme.spacing.xxs,
    },
    chatTemplateLabel: {
      flex: 1,
    },
    chatTemplateContainer: {
      flex: 2,
      height: 20,
      overflow: 'hidden',
    },
    chatTemplateMaskContainer: {
      flex: 1,
      flexDirection: 'row',
    },
    chatTemplatePreviewGradient: {
      flex: 1,
    },
    textArea: {
      ...theme.typography.uiS,
      borderRadius: theme.radius.s,
      maxHeight: screenHeight * 0.4,
    },
    completionSettingsContainer: {
      marginTop: theme.spacing.sm,
      paddingHorizontal: theme.spacing.xxs,
    },
    switchContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginVertical: theme.spacing.xs,
    },
    switchLabel: {
      ...theme.typography.uiM,
      color: theme.colors.onSurface,
    },
    settingsSection: {
      paddingVertical: theme.spacing.s,
    },
    modelNameLabel: {
      ...theme.typography.titleS,
      color: theme.colors.onSurface,
      paddingVertical: theme.spacing.s,
    },
    divider: {
      marginVertical: theme.spacing.xs,
    },
    templateNote: {
      color: theme.colors.textSecondary,
      marginVertical: theme.spacing.s,
    },
    stopLabel: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    settingItem: {
      marginBottom: theme.spacing.l,
      paddingHorizontal: theme.spacing.xs,
    },
    settingLabel: {
      marginBottom: theme.spacing.xxs,
    },
    settingValue: {
      textAlign: 'right',
    },
    stopWordsContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.s,
      marginBottom: theme.spacing.s,
    },
    stopChip: {
      marginEnd: theme.spacing.xs,
      marginVertical: theme.spacing.xs,
    },
    stopChipContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xs,
    },
    stopChipText: {
      ...theme.typography.uiS,
      color: theme.colors.onSurface,
    },
    sheetContainer: {
      padding: theme.spacing.m,
    },
    actionsContainer: {
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
