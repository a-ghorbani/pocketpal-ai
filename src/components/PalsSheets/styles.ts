import {StyleSheet} from 'react-native';
import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    sliderContainer: {
      marginBottom: 16,
      paddingHorizontal: 8,
    },
    sliderLabel: {
      ...theme.fonts.bodyMedium,
      marginBottom: 8,
    },
    slider: {
      width: '100%',
      height: 40,
    },
    sliderLabels: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      width: '100%',
      marginTop: -8,
    },
    sliderMinLabel: {
      ...theme.fonts.bodySmall,
      color: theme.colors.onSurfaceVariant,
    },
    sliderMaxLabel: {
      ...theme.fonts.bodySmall,
      color: theme.colors.onSurfaceVariant,
    },
    scrollviewContainer: {
      padding: theme.spacing.default,
    },
    form: {
      gap: theme.spacing.default,
      padding: theme.spacing.default,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borders.default,
    },
    innerForm: {
      gap: theme.spacing.default,
    },
    modelNotDownloaded: {
      gap: 12,
    },
    progressBar: {
      height: 8,
      borderRadius: 5,
    },
    errorContainer: {
      gap: 12,
    },
    errorMessage: {
      color: theme.colors.error,
      lineHeight: 20,
    },
    recommendedModelContainer: {
      gap: 6,
      paddingLeft: 4,
    },
    recommendedLabel: {
      color: theme.colors.onSurfaceVariant,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    modelDetailsContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    modelDetails: {
      color: theme.colors.onSurface,
      flex: 1,
    },
    modelSize: {
      color: theme.colors.onSurfaceVariant,
      fontWeight: '500',
    },
    field: {
      gap: 4,
    },
    dividerContainer: {
      marginVertical: theme.spacing.default,
    },
    dividerContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.default,
    },
    dividerLabel: {
      color: theme.colors.onSurfaceVariant,
    },
    dividerLine: {
      flex: 1,
    },
    label: {
      ...theme.fonts.titleMedium,
      color: theme.colors.onSurface,
    },
    sublabel: {
      ...theme.fonts.bodySmall,
      color: theme.colors.onSurfaceVariant,
    },
    input: {
      backgroundColor: theme.colors.surface,
    },
    checkboxContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    actions: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 8,
      width: '100%',
    },
    actionBtn: {
      flex: 1,
    },
    warningContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 8,
    },
    warningText: {
      color: theme.colors.error,
      flex: 1,
    },
    resetButton: {
      marginLeft: 8,
    },
    // New styles for LookieSheet
    modelDownloadSection: {
      gap: 16,
      marginTop: 8,
      marginBottom: 16,
    },
    modelSectionTitle: {
      ...theme.fonts.bodyMedium,
      color: theme.colors.onSurfaceVariant,
      marginBottom: 8,
    },
    modelItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 12,
      backgroundColor: theme.colors.surfaceVariant,
      borderRadius: theme.borders.default,
    },
    modelInfo: {
      flex: 1,
      marginRight: 12,
    },
    modelName: {
      ...theme.fonts.titleSmall,
      color: theme.colors.onSurface,
    },
    modelDescription: {
      ...theme.fonts.bodySmall,
      color: theme.colors.onSurfaceVariant,
    },
    renderedPromptContainer: {
      backgroundColor: theme.colors.surfaceVariant,
      borderRadius: theme.borders.default,
      padding: theme.spacing.default,
      marginTop: 8,
      borderWidth: 1,
      borderColor: theme.colors.outline,
    },
    renderedPromptText: {
      ...theme.fonts.bodyMedium,
      color: theme.colors.onSurfaceVariant,
      lineHeight: 20,
    },
    templateModeHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    toggleButton: {
      margin: 0,
    },
    resetOptionsContainer: {
      flexDirection: 'row',
      justifyContent: 'flex-start',
      gap: 8,
      marginTop: 8,
    },
    generationSettingsSection: {
      paddingHorizontal: theme.spacing.default,
      marginBottom: theme.spacing.default,
    },
    generationSettingsButton: {
      marginTop: 8,
    },
  });
