import {StyleSheet} from 'react-native';

import type {Theme} from '../../utils/types';

export const overlayStyles = (theme: Theme, topInset: number) =>
  StyleSheet.create({
    root: {
      position: 'absolute',
      top: topInset + 8,
      left: 16,
      right: 16,
      zIndex: 100,
    },
  });

export const bannerStyles = (theme: Theme) =>
  StyleSheet.create({
    root: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      backgroundColor: theme.colors.background,
      borderRadius: theme.radius.m,
      borderWidth: theme.stroke.xs,
      borderColor: theme.colors.mutedLight,
      paddingVertical: 10,
      paddingHorizontal: theme.spacing.sm,
      shadowColor: theme.colors.shadow,
      shadowOffset: {width: 0, height: 2},
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 4,
    },
    avatar: {
      width: 36,
      height: 36,
      borderRadius: theme.radius.s,
      backgroundColor: theme.colors.secondaryDefault,
      borderWidth: theme.stroke.xs,
      borderColor: theme.colors.mutedLight,
    },
    content: {
      flex: 1,
      gap: theme.spacing.xs,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.s,
    },
    title: {
      ...theme.typography.titleS,
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
      padding: 2,
      overflow: 'hidden',
    },
    fill: {
      height: 4,
      borderRadius: theme.radius.xxl,
      backgroundColor: theme.colors.accent.greenStrong,
    },
    dismiss: {
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });

export const sheetStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      paddingHorizontal: theme.spacing.m,
      paddingBottom: theme.spacing.l,
      gap: theme.spacing.m,
    },
    row: {
      gap: theme.spacing.s,
    },
    rowTitle: {
      ...theme.typography.titleS,
      color: theme.colors.onBackground,
    },
    cancel: {
      borderColor: theme.colors.mutedLight,
    },
  });
