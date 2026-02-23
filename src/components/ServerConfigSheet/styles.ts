import {StyleSheet} from 'react-native';
import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) => {
  return StyleSheet.create({
    container: {
      padding: 16,
      paddingBottom: 32,
    },
    description: {
      marginBottom: 16,
      color: theme.colors.onSurface,
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
    testResultContainer: {
      marginTop: 8,
      marginBottom: 12,
      padding: 12,
      borderRadius: 8,
    },
    testSuccess: {
      backgroundColor: theme.colors.primaryContainer,
    },
    testFailure: {
      backgroundColor: theme.colors.errorContainer,
    },
    testResultText: {
      fontSize: 13,
    },
    testSuccessText: {
      color: theme.colors.onPrimaryContainer,
    },
    testFailureText: {
      color: theme.colors.onErrorContainer,
    },
    buttonsContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      width: '100%',
    },
    saveButton: {
      flex: 1,
      marginRight: 8,
    },
    testButton: {
      flex: 1,
      marginLeft: 8,
    },
    privacyContainer: {
      marginBottom: 16,
      backgroundColor: theme.colors.surfaceContainerLow,
      padding: 16,
      borderRadius: 8,
    },
    privacyText: {
      color: theme.colors.onSurface,
      fontSize: 13,
    },
    errorText: {
      color: theme.colors.error,
      fontSize: 12,
      marginTop: 4,
    },
  });
};
