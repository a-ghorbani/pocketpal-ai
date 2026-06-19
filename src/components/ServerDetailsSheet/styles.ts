import {StyleSheet} from 'react-native';
import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) => {
  return StyleSheet.create({
    container: {
      padding: 16,
      paddingBottom: 32,
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
    modelsSection: {
      marginTop: 8,
      marginBottom: 12,
    },
    modelsSectionLabel: {
      fontSize: 14,
      fontWeight: '500',
      color: theme.colors.onSurface,
      marginBottom: 8,
    },
    modelItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 4,
    },
    modelDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: theme.colors.onSurfaceVariant,
      marginRight: 8,
    },
    modelItemText: {
      fontSize: 14,
      color: theme.colors.onSurface,
    },
    buttonsContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      width: '100%',
    },
    saveButton: {
      flex: 1,
    },
    removeSection: {
      marginTop: 16,
      alignItems: 'center',
    },
    removeDescription: {
      fontSize: 12,
      color: theme.colors.onSurfaceVariant,
      marginTop: 4,
    },
    errorText: {
      color: theme.colors.error,
      fontSize: 12,
      marginTop: 4,
    },
  });
};
