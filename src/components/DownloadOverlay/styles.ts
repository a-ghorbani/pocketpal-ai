import {StyleSheet} from 'react-native';

import type {Theme} from '../../utils/types';

export const overlayStyles = (theme: Theme, topInset: number) =>
  StyleSheet.create({
    root: {
      position: 'absolute',
      top: topInset - 4,
      left: 50,
      right: 45,
      zIndex: 100,
    },
  });

export const bannerStyles = (theme: Theme) =>
  StyleSheet.create({
    root: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.s,
      backgroundColor: theme.colors.background,
      borderRadius: theme.radius.m,
      borderWidth: theme.stroke.xs,
      borderColor: theme.colors.mutedLight,
      paddingVertical: 6,
      paddingHorizontal: 10,
      shadowColor: theme.colors.shadow,
      shadowOffset: {width: 0, height: 2},
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 4,
    },
    avatar: {
      width: 26,
      height: 26,
      borderRadius: theme.radius.xs,
      backgroundColor: theme.colors.secondaryDefault,
      borderWidth: theme.stroke.xs,
      borderColor: theme.colors.mutedLight,
    },
    content: {
      flex: 1,
      gap: 2,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.s,
    },
    title: {
      ...theme.typography.uiS,
      flex: 1,
      color: theme.colors.onBackground,
    },
    eta: {
      ...theme.typography.captionS,
      color: theme.colors.outlineVariant,
    },
    track: {
      backgroundColor: theme.colors.secondaryDefault,
      borderRadius: theme.radius.xxl,
      padding: 1,
      overflow: 'hidden',
    },
    fill: {
      height: 3,
      borderRadius: theme.radius.xxl,
      backgroundColor: theme.colors.accent.greenStrong,
    },
    dismiss: {
      width: 22,
      height: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    body: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.s,
    },
    badge: {
      paddingHorizontal: theme.spacing.s,
      paddingVertical: 1,
      borderRadius: theme.radius.xxl,
      backgroundColor: theme.colors.secondaryDefault,
    },
    badgeText: {
      ...theme.typography.captionS,
      color: theme.colors.onSurfaceVariant,
    },
    stop: {
      paddingHorizontal: theme.spacing.s,
      height: 24,
      borderRadius: theme.radius.s,
      borderWidth: theme.stroke.xs,
      borderColor: theme.colors.mutedLight,
      backgroundColor: theme.colors.secondaryDefault,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stopText: {
      ...theme.typography.captionS,
      color: theme.colors.onBackground,
    },
  });
