import {StyleSheet} from 'react-native';

import type {Theme} from '../../utils/types';

// Pal-carousel avatar card geometry (canonical Figma 888:33827).
const PAL_AVATAR_WIDTH = 48;
const PAL_AVATAR_HEIGHT = 45.45;
const PAL_AVATAR_RADIUS = 18;
const PAL_AVATAR_INNER_RADIUS = 16;
// Intrinsic height of one carousel item (see `carousel` style note).
const PAL_ITEM_HEIGHT = 72;
const HISTORY_AVATAR_SIZE = 16;
const COMPOSER_ATTACH_HEIGHT = 40;
const COMPOSER_SEND_HEIGHT = 32;
const BOTTOM_FADE_HEIGHT = 129;

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.colors.mutedBackground,
    },
    body: {
      flex: 1,
      paddingHorizontal: theme.spacing.m,
      gap: theme.spacing.xxl,
    },

    // A. Content — bottom-anchored hero block.
    content: {
      flex: 1,
      justifyContent: 'flex-end',
      gap: theme.spacing.l,
      paddingBottom: theme.spacing.xxl,
    },
    title: {
      ...theme.typography.headlineH1,
      lineHeight: 50,
      color: theme.colors.foregroundPrimary,
    },

    // Pal carousel. The horizontal scroller is pinned to its intrinsic
    // item height so it does NOT flex-grow inside the bottom-anchored
    // (justify-end) Content column — otherwise it absorbs the column's
    // slack and pushes the title to the top.
    // Item height = avatar 45.45 + paddingTop 2 + gap 2 + label lh 18 +
    // paddingBottom 4 ≈ 71.45 → 72.
    carousel: {
      flexGrow: 0,
      flexShrink: 0,
      height: PAL_ITEM_HEIGHT,
    },
    carouselContent: {
      gap: theme.spacing.s,
      alignItems: 'flex-start',
    },
    palItem: {
      alignItems: 'center',
      gap: theme.spacing.xxs,
      paddingTop: theme.spacing.xxs,
      paddingBottom: theme.spacing.xs,
      paddingHorizontal: theme.spacing.xs,
    },
    palAvatar: {
      width: PAL_AVATAR_WIDTH,
      height: PAL_AVATAR_HEIGHT,
      borderRadius: PAL_AVATAR_RADIUS,
      padding: theme.spacing.xxs,
      backgroundColor: theme.colors.background,
      shadowColor: theme.colors.shadow,
      shadowOffset: {width: 0, height: 2},
      shadowOpacity: 0.12,
      shadowRadius: 2,
      elevation: 2,
    },
    palAvatarActive: {
      borderWidth: 2,
      borderColor: theme.colors.yellowAccent,
    },
    palAvatarInner: {
      flex: 1,
      borderRadius: PAL_AVATAR_INNER_RADIUS,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    palAvatarImage: {
      width: '100%',
      height: '100%',
    },
    addAvatar: {
      backgroundColor: theme.colors.surfaceVariant,
      borderWidth: 2,
      borderColor: theme.colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    palLabel: {
      ...theme.typography.captionS,
      ...theme.typography.uiS,
      fontSize: 11,
      lineHeight: 18,
      letterSpacing: 0.11,
      color: theme.colors.foregroundTertiary,
      textAlign: 'center',
    },
    palLabelActive: {
      color: theme.colors.yellowHighestContrast,
    },

    // Composer card.
    composer: {
      backgroundColor: theme.colors.background,
      borderWidth: theme.stroke.xs,
      borderColor: theme.colors.mutedLight,
      borderRadius: theme.radius.s,
      paddingTop: theme.spacing.m,
      paddingBottom: theme.spacing.s,
      shadowColor: theme.colors.shadow,
      shadowOffset: {width: 0, height: 1},
      shadowOpacity: 0.03,
      shadowRadius: 2,
      elevation: 1,
    },
    composerInput: {
      ...theme.typography.bodyM,
      fontSize: 15,
      lineHeight: 28,
      letterSpacing: -0.15,
      color: theme.colors.onSurface,
      minHeight: 74,
      paddingHorizontal: theme.spacing.m,
      paddingVertical: theme.spacing.s,
      textAlignVertical: 'top',
    },
    composerActions: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      paddingHorizontal: theme.spacing.m,
      paddingVertical: theme.spacing.s,
    },
    composerAttach: {
      height: COMPOSER_ATTACH_HEIGHT,
      paddingHorizontal: theme.spacing.sm,
      borderRadius: theme.radius.m,
      borderWidth: theme.stroke.xs,
      borderColor: theme.colors.mutedLight,
      backgroundColor: theme.colors.secondaryDefault,
      alignItems: 'center',
      justifyContent: 'center',
    },
    composerEndAddon: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.m,
    },
    composerMic: {
      width: 20,
      height: 20,
      borderRadius: theme.radius.s,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendButton: {
      width: COMPOSER_SEND_HEIGHT,
      height: COMPOSER_SEND_HEIGHT,
      borderRadius: theme.radius.s,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    sendButtonDisabled: {
      opacity: 0.4,
    },

    // Model-used chip row.
    modelChip: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing.xs,
      padding: theme.spacing.s,
    },
    modelChipPrefix: {
      ...theme.typography.captionS,
      fontSize: 10,
      lineHeight: 18,
      letterSpacing: 0.1,
      color: theme.colors.foregroundSubtle,
    },
    modelChipName: {
      ...theme.typography.captionS,
      ...theme.typography.uiS,
      fontSize: 11,
      lineHeight: 18,
      letterSpacing: 0.11,
      color: theme.colors.foregroundTertiary,
      flexShrink: 1,
    },

    // B. Previous chats.
    historyHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
    },
    historyTitle: {
      ...theme.typography.uiM,
      fontSize: 14,
      lineHeight: 20,
      letterSpacing: 0.14,
      color: theme.colors.foregroundTertiary,
      flex: 1,
    },
    historySearch: {
      width: 28,
      height: 28,
      borderRadius: theme.radius.m,
      alignItems: 'center',
      justifyContent: 'center',
    },
    historyList: {
      gap: theme.spacing.xs,
    },
    historyRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: theme.colors.background,
      borderRadius: theme.radius.s,
      paddingHorizontal: theme.spacing.m,
      paddingVertical: theme.spacing.ml,
      shadowColor: theme.colors.shadow,
      shadowOffset: {width: 0, height: 1},
      shadowOpacity: 0.03,
      shadowRadius: 1,
      elevation: 1,
    },
    historyRowMain: {
      flex: 1,
      gap: theme.spacing.xxs,
    },
    historyRowTitle: {
      ...theme.typography.uiM,
      fontSize: 14,
      lineHeight: 20,
      letterSpacing: 0.14,
      color: theme.colors.foregroundPrimary,
    },
    historyInfoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xs,
    },
    historyAvatar: {
      width: HISTORY_AVATAR_SIZE,
      height: HISTORY_AVATAR_SIZE,
      borderRadius: theme.radius.s,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    historyAvatarImage: {
      width: '100%',
      height: '100%',
    },
    historyMetaText: {
      ...theme.typography.captionS,
      ...theme.typography.uiS,
      fontSize: 11,
      lineHeight: 18,
      letterSpacing: 0.11,
      color: theme.colors.foregroundTertiary,
    },
    historyMore: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingLeft: theme.spacing.s,
    },
    emptyHint: {
      ...theme.typography.bodyS,
      color: theme.colors.foregroundTertiary,
    },

    // C. Bottom gradient fade behind the floating tab bar.
    bottomFade: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: BOTTOM_FADE_HEIGHT,
    },
  });
