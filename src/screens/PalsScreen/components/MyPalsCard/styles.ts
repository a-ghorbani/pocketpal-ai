import {StyleSheet} from 'react-native';

import {Theme} from '../../../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      marginBottom: theme.spacing.sm,
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.m,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
    },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: theme.radius.m,
      backgroundColor: theme.colors.surfaceVariant,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    avatarImage: {
      width: '100%',
      height: '100%',
    },
    avatarText: {
      ...theme.typography.titleM,
      color: theme.colors.onSurfaceVariant,
    },
    body: {
      flex: 1,
      gap: theme.spacing.xxs,
    },
    name: {
      ...theme.typography.titleS,
      color: theme.colors.foregroundPrimary,
    },
    subtitle: {
      ...theme.typography.bodyS,
      color: theme.colors.foregroundTertiary,
    },
    categories: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: theme.spacing.xs,
      marginTop: theme.spacing.xxs,
    },
    categoryChip: {
      marginEnd: 0,
    },
  });
