import {StyleSheet} from 'react-native';
import {Theme} from '../../../utils';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    // Auth Sheet
    authSheet: {
      padding: 16,
    },
    authHeader: {
      padding: 24,
      alignItems: 'center',
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.outline,
    },
    authTitle: {
      fontSize: 24,
      fontWeight: 'bold',
      color: theme.colors.onSurface,
      marginBottom: 8,
    },
    authSubtitle: {
      fontSize: 16,
      color: theme.colors.onSurfaceVariant,
      textAlign: 'center',
    },
    authContent: {
      padding: 24,
    },
    authForm: {
      gap: 16,
    },
    authInput: {
      backgroundColor: theme.colors.surfaceVariant,
    },
    authButton: {
      height: 48,
      marginTop: 8,
    },
    authButtonContent: {
      height: 48,
      justifyContent: 'center',
    },
    authDivider: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: 24,
    },
    authDividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: theme.colors.outline,
    },
    authDividerText: {
      paddingHorizontal: 16,
      fontSize: 14,
      color: theme.colors.onSurfaceVariant,
    },
    authSocialButton: {
      height: 48,
      borderColor: theme.colors.outline,
    },
    authToggle: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 16,
    },
    authToggleText: {
      fontSize: 14,
      color: theme.colors.onSurfaceVariant,
      lineHeight: 20,
    },
    authToggleLink: {
      fontSize: 14,
      color: theme.colors.primary,
      fontWeight: '600',
    },
    authToggleButtonContent: {
      paddingHorizontal: 0,
      paddingVertical: 0,
      minHeight: 20,
    },
    authLoadingContainer: {
      alignItems: 'center',
      marginBottom: 16,
    },
    authErrorText: {
      color: theme.colors.error,
      marginBottom: 16,
    },
    // Auth Prompt
    authPrompt: {
      padding: 16,
      alignItems: 'center',
      borderTopWidth: 1,
      borderTopColor: theme.colors.outline,
      backgroundColor: theme.colors.surfaceVariant,
    },
    authPromptText: {
      fontSize: 14,
      color: theme.colors.onSurfaceVariant,
      textAlign: 'center',
      marginBottom: 12,
    },
  });
