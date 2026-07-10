import {StyleSheet} from 'react-native';

import type {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.colors.background,
      borderRadius: theme.radius.s,
      borderWidth: theme.stroke.xs,
      borderColor: theme.colors.mutedLight,
      padding: theme.spacing.sm,
      gap: theme.spacing.sm,
      shadowColor: theme.colors.shadow,
      shadowOffset: {width: 0, height: 1},
      shadowOpacity: 0.03,
      shadowRadius: 2,
      elevation: 1,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.s,
    },
    title: {
      ...theme.typography.titleS,
      flex: 1,
      color: theme.colors.onBackground,
    },
    size: {
      ...theme.typography.captionM,
      color: theme.colors.onSurfaceVariant,
    },
    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.m,
    },
    progressGroup: {
      flex: 1,
      gap: theme.spacing.xs,
    },
    track: {
      backgroundColor: theme.colors.secondaryDefault,
      borderRadius: theme.radius.xxl,
      padding: 2,
      overflow: 'hidden',
    },
    fill: {
      height: 6,
      borderRadius: theme.radius.xxl,
      backgroundColor: theme.colors.accent.greenStrong,
    },
    captionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing.s,
    },
    bytes: {
      ...theme.typography.captionS,
      flex: 1,
      color: theme.colors.onSurfaceVariant,
    },
    eta: {
      ...theme.typography.captionS,
      color: theme.colors.outlineVariant,
      textAlign: 'right',
    },
    stopBtn: {
      backgroundColor: theme.colors.secondaryDefault,
      borderRadius: theme.radius.s,
      borderWidth: theme.stroke.xs,
      borderColor: theme.colors.mutedLight,
      paddingHorizontal: theme.spacing.s,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stopText: {
      ...theme.typography.captionM,
      color: theme.colors.onBackground,
    },
  });
