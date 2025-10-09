import {StyleSheet} from 'react-native';
import {Theme} from '../../../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    content: {
      padding: 16,
    },
    profileHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      marginBottom: 24,
    },
    avatarContainer: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: theme.colors.primaryContainer,
      alignItems: 'center',
      justifyContent: 'center',
    },
    userInfo: {
      flex: 1,
    },
    userName: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.colors.onSurface,
      marginBottom: 4,
    },
    userEmail: {
      fontSize: 14,
      color: theme.colors.onSurfaceVariant,
    },
    divider: {
      marginVertical: 16,
    },
    actions: {
      gap: 16,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.colors.onSurface,
      marginBottom: 8,
    },
    actionButton: {
      borderColor: theme.colors.outline,
      borderRadius: 12,
    },
    signInPrompt: {
      alignItems: 'center',
      paddingVertical: 32,
      gap: 16,
    },
    signInTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: theme.colors.onSurface,
      textAlign: 'center',
    },
    signInDescription: {
      fontSize: 14,
      color: theme.colors.onSurfaceVariant,
      textAlign: 'center',
      lineHeight: 20,
      paddingHorizontal: 16,
    },
    signInButton: {
      marginTop: 8,
      paddingHorizontal: 32,
    },
  });
