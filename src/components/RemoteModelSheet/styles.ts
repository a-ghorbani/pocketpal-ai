import {StyleSheet} from 'react-native';
import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) => {
  return StyleSheet.create({
    container: {
      padding: 16,
      paddingBottom: 32,
    },
    privacyContainer: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 16,
      backgroundColor: theme.colors.tertiaryContainer,
      padding: 12,
      borderRadius: 8,
    },
    privacyText: {
      flex: 1,
      color: theme.colors.onTertiaryContainer,
      fontSize: 13,
      marginLeft: 8,
    },
    privacyDismiss: {
      marginLeft: 8,
      padding: 4,
    },
    chipsSection: {
      marginBottom: 16,
    },
    chipsSectionLabel: {
      fontSize: 14,
      fontWeight: '500',
      color: theme.colors.onSurface,
      marginBottom: 8,
    },
    chipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    dividerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: 12,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: theme.colors.outlineVariant,
    },
    dividerText: {
      marginHorizontal: 12,
      fontSize: 12,
      color: theme.colors.onSurfaceVariant,
    },
    inputSpacing: {
      marginBottom: 12,
    },
    apiKeyDescription: {
      marginTop: 4,
      marginBottom: 12,
      color: theme.colors.onSurfaceVariant,
      fontSize: 12,
    },
    warningContainer: {
      marginTop: 4,
      marginBottom: 12,
      backgroundColor: theme.colors.errorContainer,
      padding: 12,
      borderRadius: 8,
    },
    warningText: {
      color: theme.colors.onErrorContainer,
      fontSize: 12,
    },
    probeStatusContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 4,
      marginBottom: 8,
    },
    probeStatusText: {
      fontSize: 12,
      marginLeft: 4,
    },
    probeSuccessText: {
      color: theme.colors.primary,
    },
    probeErrorText: {
      color: theme.colors.error,
    },
    modelListSection: {
      marginTop: 8,
      marginBottom: 12,
    },
    modelListLabel: {
      fontSize: 14,
      fontWeight: '500',
      color: theme.colors.onSurface,
      marginBottom: 8,
    },
    modelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
    },
    modelRowDisabled: {
      opacity: 0.5,
    },
    modelName: {
      flex: 1,
      fontSize: 14,
      color: theme.colors.onSurface,
      marginLeft: 8,
    },
    alreadyAddedText: {
      fontSize: 12,
      color: theme.colors.onSurfaceVariant,
      fontStyle: 'italic',
      marginLeft: 4,
    },
    noModelsText: {
      fontSize: 14,
      color: theme.colors.onSurfaceVariant,
      textAlign: 'center',
      paddingVertical: 16,
    },
    chipErrorContainer: {
      marginTop: 8,
      marginBottom: 12,
    },
    chipErrorActions: {
      flexDirection: 'row',
      marginTop: 8,
    },
    chipServerInfo: {
      marginBottom: 12,
    },
    chipServerName: {
      fontSize: 16,
      fontWeight: '500',
      color: theme.colors.onSurface,
    },
    chipServerUrl: {
      fontSize: 12,
      color: theme.colors.onSurfaceVariant,
    },
    errorText: {
      color: theme.colors.error,
      fontSize: 12,
      marginTop: 4,
    },
    buttonsContainer: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      width: '100%',
    },
    addButton: {
      flex: 1,
    },
  });
};
