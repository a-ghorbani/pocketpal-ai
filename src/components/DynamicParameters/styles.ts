import {StyleSheet} from 'react-native';
import type {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    // DynamicParameterForm styles
    innerForm: {
      gap: 16,
    },

    // DynamicTextField and DynamicDateTimeTagField styles
    field: {
      gap: 8,
    },
    sublabel: {
      ...theme.fonts.bodySmall,
      color: theme.colors.onSurfaceVariant,
    },
    errorText: {
      color: theme.colors.error,
      marginTop: 4,
    },

    // DynamicDateTimeTagField styles
    dateTimeButton: {
      borderWidth: 1,
      borderRadius: theme.borders.default,
      padding: 16,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 56,
      backgroundColor: theme.colors.surface,
    },
    dateTimeButtonError: {
      borderColor: theme.colors.error,
    },
    dateTimeButtonNormal: {
      borderColor: theme.colors.outline,
    },
    dateTimeButtonDisabled: {
      opacity: 0.6,
    },
    dateTimeTagContainer: {
      alignItems: 'center',
    },
    dateTimeTagText: {
      color: theme.colors.primary,
    },
    dateTimeTagSubtext: {
      color: theme.colors.onSurfaceVariant,
      marginTop: 4,
    },
    dateTimePlaceholderText: {
      color: theme.colors.onSurfaceVariant,
    },
  });
