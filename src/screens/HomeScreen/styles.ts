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
// Floating tab bar footprint (MainTabs: bottom safe-area inset ≈ 34 + bar
// height 48 ≈ 82) plus breathing room, so the centered empty block clears it.
const EMPTY_STATE_TAB_BAR_CLEARANCE = 110;
const EMPTY_STATE_ICON_BUTTON_HEIGHT = 28;
export const EMPTY_STATE_ICON_SIZE = 20;

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.colors.mutedBackground,
    },
    // Scroll content container. flexGrow (not flex) lets the column take at
    // least the viewport height while giving the bottom-anchored Content child
    // vertical slack. paddingTop is the canonical Body top inset (Spacing/XXL
    // ×3 = 120) sitting on top of the consumed top safe-area inset, which lands
    // the title ~1/5 down to match the reference.
    body: {
      flexGrow: 1,
      paddingTop: theme.spacing.xxl * 3,
      paddingHorizontal: theme.spacing.m,
      gap: theme.spacing.xxl,
    },
    // Empty (first-time) variant: a smaller top inset keeps the whole column
    // (hero + centered empty block + tab-bar clearance) within the viewport so
    // the block can sit in the band between the model-chip and the tab bar
    // without the content overflowing and pinning the block under the tab bar.
    bodyEmpty: {
      paddingTop: theme.spacing.xxl,
    },
    // A. Content — bottom-anchored hero block. The hero takes the column slack
    // and justify-end pins it low, letting the history peek + fade under the
    // floating tab bar (populated) or seating the centered empty block below.
    content: {
      flex: 1,
      justifyContent: 'flex-end',
      gap: theme.spacing.l,
      paddingBottom: theme.spacing.xxl,
    },
    // Empty variant: the hero hugs its content (top-anchored after the inset)
    // so the region below can take the column slack and center the empty block.
    contentEmpty: {
      flex: 0,
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
    // Width pinned to the avatar footprint (48 + 2×paddingH 4) so the
    // numberOfLines={1} label ellipsizes instead of widening the item — keeps
    // the carousel pitch tight enough to fit pals + Add in one viewport.
    palItem: {
      width: PAL_AVATAR_WIDTH + 2 * theme.spacing.xs,
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
      alignSelf: 'stretch',
    },
    palLabelActive: {
      color: theme.colors.yellowHighestContrast,
    },

    // Composer cluster (card + model chip).
    composerDock: {},
    // Composer card — a launcher. Tapping anywhere opens the Chat screen; it
    // accepts no text input, so the card shows the placeholder as static text.
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
    // Holds the static placeholder; keeps the prior TextInput box geometry so
    // the resting card is visually identical to the editable version.
    composerInput: {
      minHeight: 74,
      paddingHorizontal: theme.spacing.m,
      paddingVertical: theme.spacing.s,
    },
    composerPlaceholder: {
      ...theme.typography.bodyM,
      fontSize: 15,
      lineHeight: 28,
      letterSpacing: -0.15,
      color: theme.colors.foregroundTertiary,
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

    // B. Previous chats. Empty variant: the region takes the column slack so
    // the empty block centers in the band between the model-chip and tab bar.
    historyRegionEmpty: {
      flex: 1,
    },
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
      paddingStart: theme.spacing.s,
    },

    // First-time-user empty state (Figma 888:33856): replaces the history list
    // when there are no sessions — a centered chat-bubble icon above a centered
    // subtle-grey message, filling the region in normal flow. marginBottom lifts
    // the centering band clear of the absolute floating tab bar so the block is
    // never bottom-pinned or occluded.
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing.s,
      paddingHorizontal: theme.spacing.s,
      marginBottom: EMPTY_STATE_TAB_BAR_CLEARANCE,
    },
    emptyStateIcon: {
      height: EMPTY_STATE_ICON_BUTTON_HEIGHT,
      padding: theme.spacing.xxs,
      borderRadius: theme.radius.m,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyHint: {
      ...theme.typography.bodyS,
      fontSize: 13,
      lineHeight: 20,
      letterSpacing: 0.195,
      color: theme.colors.foregroundSubtle,
      textAlign: 'center',
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
