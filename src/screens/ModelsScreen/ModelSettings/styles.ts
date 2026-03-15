import {Dimensions, StyleSheet} from 'react-native';

import {Theme} from '../../../utils/types';

const screenHeight = Dimensions.get('window').height;
const templateBoxHeight = screenHeight * 0.28;

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      padding: 16,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borders.default,
    },
    chatTemplateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 2,
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
      fontSize: 12,
      lineHeight: 16,
      borderRadius: 8,
      maxHeight: screenHeight * 0.4,
    },
    completionSettingsContainer: {
      marginTop: 12,
      paddingHorizontal: 2,
    },
    switchContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginVertical: 4,
    },
    settingsSection: {
      paddingVertical: 8,
    },
    modelNameLabel: {
      ...theme.fonts.titleMediumLight,
      paddingVertical: 8,
    },
    divider: {
      marginVertical: 4,
    },
    templateNote: {
      color: theme.colors.textSecondary,
      marginVertical: 8,
    },
    templateMeta: {
      color: theme.colors.textSecondary,
      marginTop: 6,
      paddingHorizontal: 2,
    },
    sectionHeader: {
      marginBottom: 8,
      paddingHorizontal: 2,
    },
    templateEditor: {
      borderRadius: 8,
      height: templateBoxHeight,
      marginTop: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      overflow: 'hidden',
    },
    templateEditorInput: {
      flex: 1,
      fontSize: 12,
      lineHeight: 16,
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: 10,
      color: theme.colors.text,
    },
    effectiveTemplatePreviewText: {
      fontSize: 12,
      lineHeight: 18,
      color: theme.colors.textSecondary,
    },
    effectiveTemplatePreviewInput: {
      fontSize: 12,
      lineHeight: 16,
      borderRadius: 8,
      height: templateBoxHeight,
      marginTop: 8,
      position: 'relative',
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      overflow: 'hidden',
    },
    effectiveTemplatePreviewTextInput: {
      flex: 1,
    },
    previewScrollView: {
      flex: 1,
    },
    previewCopyButton: {
      position: 'absolute',
      right: 4,
      top: 4,
      zIndex: 2,
      margin: 0,
      minWidth: 64,
      height: 28,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    previewCopyButtonContent: {
      height: 28,
    },
    previewCopyButtonLabel: {
      fontSize: 12,
      marginVertical: 0,
    },
    previewScrollContent: {
      paddingHorizontal: 12,
      paddingTop: 36,
      paddingBottom: 10,
    },
    stopLabel: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    settingItem: {
      marginBottom: 24,
      paddingHorizontal: 4,
    },
    settingLabel: {
      marginBottom: 2,
    },
    settingValue: {
      textAlign: 'right',
    },
    stopWordsContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 8,
    },
    stopChip: {
      marginRight: 4,
      marginVertical: 4,
    },
    stopChipText: {
      fontSize: 12,
    },
    sheetContainer: {
      padding: 16,
    },
    actionsContainer: {
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
