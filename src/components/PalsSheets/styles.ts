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
      gap: 10,
    },
    progressBar: {
      height: 8,
      borderRadius: 5,
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
  });
