import {StyleSheet} from 'react-native';
import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      paddingHorizontal: 16,
      paddingTop: 8,
    },
    section: {
      marginBottom: 24,
    },
    label: {
      marginBottom: 8,
      color: theme.colors.onSurface,
    },
    infoNote: {
      color: theme.colors.onSurfaceVariant,
      lineHeight: 20,
      backgroundColor: theme.colors.surfaceVariant,
      padding: 12,
      borderRadius: 8,
    },
    categoryButton: {
      justifyContent: 'flex-start',
    },
    categoryButtonContent: {
      justifyContent: 'space-between',
      flexDirection: 'row-reverse',
    },
    textInput: {
      backgroundColor: theme.colors.surface,
    },
    switchSection: {
      marginBottom: 24,
      paddingVertical: 8,
    },
    switchContent: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    switchLabel: {
      color: theme.colors.onSurface,
    },
    switchDescription: {
      color: theme.colors.onSurfaceVariant,
      lineHeight: 16,
    },
    disabledText: {
      opacity: 0.5,
    },
    button: {},
    actionsContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      width: '100%',
      paddingHorizontal: 16,
    },
  });
