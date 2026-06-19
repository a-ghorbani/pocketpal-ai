import {StyleSheet} from 'react-native';

import type {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: theme.spacing.m,
      paddingTop: theme.spacing.l,
      paddingBottom: theme.spacing.xxl,
    },
    title: {
      ...theme.typography.headlineH1,
      color: theme.colors.onBackground,
      marginBottom: theme.spacing.l,
    },
    carousel: {
      marginBottom: theme.spacing.l,
    },
    carouselContent: {
      gap: theme.spacing.m,
      paddingRight: theme.spacing.m,
    },
    palItem: {
      alignItems: 'center',
      width: 56,
    },
    palAvatar: {
      width: 48,
      height: 48,
      borderRadius: theme.radius.xxl,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      marginBottom: theme.spacing.xs,
    },
    palAvatarImage: {
      width: '100%',
      height: '100%',
    },
    palAvatarInitial: {
      ...theme.typography.titleM,
      color: theme.colors.onPrimary,
    },
    palLabel: {
      ...theme.typography.captionS,
      color: theme.colors.onSurfaceVariant,
      textAlign: 'center',
    },
    addAvatar: {
      backgroundColor: theme.colors.surfaceVariant,
    },
    composer: {
      borderWidth: theme.stroke.sm,
      borderColor: theme.colors.outlineVariant,
      borderRadius: theme.radius.l,
      paddingHorizontal: theme.spacing.m,
      paddingTop: theme.spacing.m,
      paddingBottom: theme.spacing.s,
      marginBottom: theme.spacing.m,
    },
    composerInput: {
      ...theme.typography.bodyM,
      color: theme.colors.onSurface,
      minHeight: 48,
      textAlignVertical: 'top',
    },
    composerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: theme.spacing.s,
    },
    sendButton: {
      width: 36,
      height: 36,
      borderRadius: theme.radius.ml,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primary,
    },
    modelChip: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: theme.spacing.xs,
      paddingVertical: theme.spacing.xs,
      paddingHorizontal: theme.spacing.s,
      borderRadius: theme.radius.m,
      marginBottom: theme.spacing.l,
    },
    modelChipText: {
      ...theme.typography.captionM,
      color: theme.colors.onSurfaceVariant,
    },
    historyTitle: {
      ...theme.typography.titleM,
      color: theme.colors.onBackground,
      marginBottom: theme.spacing.m,
    },
    historyRow: {
      paddingVertical: theme.spacing.sm,
    },
    historyRowTitle: {
      ...theme.typography.bodyM,
      color: theme.colors.onSurface,
    },
    historyRowMeta: {
      ...theme.typography.captionS,
      color: theme.colors.onSurfaceVariant,
      marginTop: theme.spacing.xxs,
    },
    emptyHint: {
      ...theme.typography.bodyS,
      color: theme.colors.onSurfaceVariant,
      textAlign: 'center',
      marginTop: theme.spacing.l,
    },
  });
