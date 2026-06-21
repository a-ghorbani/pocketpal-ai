import {StyleSheet, Platform} from 'react-native';
import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      paddingHorizontal: theme.spacing.m,
      paddingTop: theme.spacing.s,
      gap: theme.spacing.sm,
    },
    privacyNote: {
      ...theme.typography.uiS,
      color: theme.colors.onSurfaceVariant,
      backgroundColor: theme.colors.surfaceVariant,
      padding: theme.spacing.sm,
      borderRadius: theme.radius.s,
    },
    errorSection: {
      backgroundColor: theme.colors.errorContainer,
      padding: theme.spacing.sm,
      borderRadius: theme.radius.s,
    },
    errorLabel: {
      color: theme.colors.onErrorContainer,
      marginBottom: theme.spacing.xs,
    },
    errorText: {
      color: theme.colors.onErrorContainer,
    },
    groupContainer: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.s,
      overflow: 'hidden',
    },
    groupDisabled: {
      opacity: 0.5,
    },
    groupHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingEnd: theme.spacing.sm,
    },
    groupTitle: {
      flex: 1,
      color: theme.colors.onSurface,
    },
    groupContent: {
      paddingHorizontal: theme.spacing.sm,
      paddingBottom: theme.spacing.sm,
      gap: theme.spacing.xs,
    },
    fieldRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: theme.spacing.xxs,
    },
    fieldLabel: {
      color: theme.colors.onSurfaceVariant,
      flex: 1,
    },
    fieldValue: {
      color: theme.colors.onSurface,
      flex: 2,
      textAlign: 'right',
    },
    jsonText: {
      ...theme.typography.captionS,
      color: theme.colors.onSurface,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      backgroundColor: theme.colors.surfaceVariant,
      padding: theme.spacing.s,
      borderRadius: theme.radius.xs,
    },
    additionalSection: {
      gap: theme.spacing.xs,
    },
    label: {
      color: theme.colors.onSurface,
    },
    textInput: {
      ...theme.typography.uiM,
      backgroundColor: theme.colors.surface,
    },
    button: {
      flex: 1,
    },
    submitLabel: {
      ...theme.typography.uiM,
      color: theme.colors.onPrimary,
    },
    actionsContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      width: '100%',
      paddingHorizontal: theme.spacing.m,
      gap: theme.spacing.sm,
    },
  });
