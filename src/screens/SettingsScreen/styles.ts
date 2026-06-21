import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    container: {
      padding: theme.spacing.m,
      gap: theme.spacing.sm,
    },
    headerRegistered: {
      alignItems: 'center',
      paddingVertical: theme.spacing.l,
      gap: theme.spacing.xxs,
    },
    welcome: {
      ...theme.fonts.headlineMedium,
      color: theme.colors.onBackground,
    },
    memberSince: {
      ...theme.fonts.bodyMedium,
      color: theme.colors.onSurfaceVariant,
    },
    ctaCard: {
      alignItems: 'center',
      paddingVertical: theme.spacing.l,
      paddingHorizontal: theme.spacing.m,
      gap: theme.spacing.sm,
    },
    avatar: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primary,
    },
    ctaTitle: {
      ...theme.fonts.headlineMedium,
      color: theme.colors.onBackground,
      textAlign: 'center',
    },
    ctaDescription: {
      ...theme.fonts.bodyMedium,
      color: theme.colors.onSurfaceVariant,
      textAlign: 'center',
    },
    ctaButton: {
      marginTop: theme.spacing.s,
    },
    group: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borders.default,
      overflow: 'hidden',
    },
    rowPressable: {
      paddingVertical: theme.spacing.m,
      paddingHorizontal: theme.spacing.m,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.m,
    },
    rowTextContainer: {
      flex: 1,
    },
    rowTitle: {
      ...theme.fonts.titleMedium,
      color: theme.colors.onSurface,
    },
    rowSubtitle: {
      ...theme.fonts.bodySmall,
      color: theme.colors.onSurfaceVariant,
    },
    rowInert: {
      opacity: 0.5,
    },
    logOut: {
      marginTop: theme.spacing.s,
    },
  });
