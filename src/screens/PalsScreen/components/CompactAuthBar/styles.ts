import {StyleSheet} from 'react-native';
import {Theme} from '../../../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      backgroundColor: theme.colors.surfaceContainerHigh,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.outline,
    },
    authenticatedContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    welcomeText: {
      fontSize: 14,
      fontWeight: '500',
      color: theme.colors.onSurface,
      flex: 1,
    },
    unauthenticatedContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    infoSection: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flex: 1,
    },
    infoText: {
      fontSize: 13,
      color: theme.colors.onSurfaceVariant,
      flex: 1,
      lineHeight: 18,
    },
    actionsSection: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    signInButton: {
      borderRadius: 20,
      minWidth: 80,
    },
    signInButtonLabel: {
      fontSize: 12,
      fontWeight: '600',
    },
    dismissButton: {
      margin: 0,
    },
  });
