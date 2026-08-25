import {I18nManager, StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

export const inputTextAlign = (): 'left' | 'right' =>
  I18nManager.isRTL ? 'right' : 'left';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    container: {
      padding: theme.spacing.m,
      gap: theme.spacing.l,
    },
    headline: {
      ...theme.typography.headlineH1,
      color: theme.colors.onBackground,
      textAlign: 'left',
    },
    subtitle: {
      ...theme.typography.bodyM,
      color: theme.colors.onSurfaceVariant,
      textAlign: 'left',
    },
    form: {
      gap: theme.spacing.m,
    },
    error: {
      ...theme.typography.captionS,
      color: theme.colors.error,
      textAlign: 'left',
    },
    dividerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
    },
    dividerLine: {
      flex: 1,
      height: theme.stroke.sm,
      backgroundColor: theme.colors.outline,
    },
    dividerLabel: {
      ...theme.typography.captionM,
      color: theme.colors.onSurfaceVariant,
    },
    socialContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.s,
    },
    socialLabel: {
      ...theme.typography.uiM,
      color: theme.colors.onSurface,
    },
    legalRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      alignItems: 'center',
      gap: theme.spacing.xs,
    },
    legalText: {
      ...theme.typography.captionS,
      color: theme.colors.onSurfaceVariant,
    },
    legalLink: {
      ...theme.typography.captionS,
      color: theme.colors.primary,
    },
    promptRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      alignItems: 'center',
      gap: theme.spacing.xs,
    },
    promptText: {
      ...theme.typography.bodyS,
      color: theme.colors.onSurfaceVariant,
    },
    promptLink: {
      ...theme.typography.bodyS,
      color: theme.colors.primary,
    },
  });
