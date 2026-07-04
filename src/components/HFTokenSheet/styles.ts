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
    instructionsContainer: {
      marginBottom: 24,
      backgroundColor: theme.colors.surfaceContainerLow,
      padding: 16,
      borderRadius: 8,
    },
    instructionsTitle: {
      fontWeight: 'bold',
      marginBottom: 8,
      color: theme.colors.onSurface,
    },
    instructionItem: {
      marginBottom: 6,
      color: theme.colors.onSurface,
    },
    linkButton: {
      marginTop: 8,
      alignSelf: 'flex-start',
      textDecorationLine: 'underline',
    },
    input: {
      marginBottom: 8,
    },
    validateButton: {
      marginTop: 8,
      marginBottom: 12,
    },
    validationResult: {
      marginTop: 8,
      marginBottom: 16,
      padding: 12,
      borderRadius: 8,
      textAlign: 'center',
    },
    validationSuccess: {
      backgroundColor: theme.colors.primaryContainer,
      color: theme.colors.onPrimaryContainer,
    },
    validationError: {
      backgroundColor: theme.colors.errorContainer,
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
    resetButton: {
      flex: 1,
      marginLeft: 8,
    },
    errorSnackbar: {
      backgroundColor: theme.colors.errorContainer,
    },
  });
};
