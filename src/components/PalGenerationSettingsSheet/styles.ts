import {StyleSheet} from 'react-native';
import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    scrollviewContainer: {
      paddingBottom: 16,
    },
    actionsContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      width: '100%',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    rightButtons: {
      flexDirection: 'row',
      gap: 8,
    },
    button: {
      minWidth: 80,
    },
    resetButton: {
      minWidth: 80,
    },
    resetButtonContent: {
      flexDirection: 'row-reverse',
    },
    resetWrapper: {
      alignItems: 'flex-start',
    },
    settingsLevelIndicator: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: theme.colors.surfaceVariant,
      borderRadius: 8,
      marginBottom: 16,
    },
    settingsLevelText: {
      marginLeft: 8,
      color: theme.colors.onSurfaceVariant,
    },
    settingsLevelIcon: {
      color: theme.colors.primary,
    },
  });
