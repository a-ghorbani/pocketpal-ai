import {StyleSheet} from 'react-native';

import type {Theme} from '../../../utils/types';

export const createPanelStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    listContent: {
      paddingHorizontal: theme.spacing.m,
      paddingBottom: theme.spacing.xxl,
      gap: theme.spacing.s,
    },
    availableHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.spacing.m,
      paddingTop: theme.spacing.s,
      paddingBottom: theme.spacing.xs,
    },
    availableTitle: {
      ...theme.typography.titleS,
      color: theme.colors.foregroundPrimary,
    },
    availableEndSlot: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.s,
    },
    loading: {
      paddingVertical: theme.spacing.xxl,
      alignItems: 'center',
    },
    loadingMore: {
      paddingVertical: theme.spacing.l,
      alignItems: 'center',
    },
    empty: {
      paddingVertical: theme.spacing.xxl,
      alignItems: 'center',
      gap: theme.spacing.s,
    },
    emptyText: {
      ...theme.typography.bodyM,
      color: theme.colors.foregroundTertiary,
      textAlign: 'center',
    },
    end: {
      paddingVertical: theme.spacing.xl,
      paddingHorizontal: theme.spacing.m,
      alignItems: 'center',
      gap: theme.spacing.s,
    },
    endTitle: {
      ...theme.typography.titleS,
      color: theme.colors.foregroundPrimary,
      textAlign: 'center',
    },
    endSubtitle: {
      ...theme.typography.bodyS,
      color: theme.colors.foregroundTertiary,
      textAlign: 'center',
    },
  });

export const createCardStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      padding: theme.spacing.m,
    },
    pricePill: {
      position: 'absolute',
      top: 0,
      end: 0,
      paddingHorizontal: theme.spacing.s,
      paddingVertical: theme.spacing.xxs,
      borderStartEndRadius: theme.radius.m,
      borderEndStartRadius: theme.radius.m,
      backgroundColor: theme.colors.yellowAccent,
    },
    pricePillText: {
      ...theme.typography.captionM,
      color: theme.colors.onYellowAccent,
    },
    row: {
      flexDirection: 'row',
      gap: theme.spacing.sm,
    },
    avatar: {
      width: 56,
      height: 56,
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
    body: {
      flex: 1,
      gap: theme.spacing.xxs,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing.s,
    },
    name: {
      ...theme.typography.titleS,
      color: theme.colors.foregroundPrimary,
      flexShrink: 1,
    },
    price: {
      ...theme.typography.captionM,
      color: theme.colors.yellowHighestContrast,
    },
    priceFree: {
      color: theme.colors.foregroundTertiary,
    },
    subtitle: {
      ...theme.typography.bodyS,
      color: theme.colors.foregroundSecondary,
    },
    categoryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xs,
    },
    extraCount: {
      ...theme.typography.captionS,
      color: theme.colors.foregroundTertiary,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: theme.spacing.xxs,
    },
    rating: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xxs,
    },
    ratingText: {
      ...theme.typography.captionM,
      color: theme.colors.foregroundPrimary,
    },
    reviewCount: {
      ...theme.typography.captionS,
      color: theme.colors.foregroundTertiary,
    },
    getAction: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xs,
    },
    getActionText: {
      ...theme.typography.uiS,
      color: theme.colors.primary,
    },
  });

export const createControlStyles = (theme: Theme) =>
  StyleSheet.create({
    filterRow: {
      flexDirection: 'row',
      gap: theme.spacing.s,
      paddingHorizontal: theme.spacing.m,
      paddingBottom: theme.spacing.s,
    },
    opener: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xs,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.s,
      borderRadius: theme.radius.l,
      borderWidth: theme.stroke.sm,
      borderColor: theme.colors.outlineVariant,
    },
    openerActive: {
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.secondaryContainer,
    },
    openerLabel: {
      ...theme.typography.uiS,
      color: theme.colors.foregroundSecondary,
    },
    sortControl: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xs,
    },
    sortLabel: {
      ...theme.typography.uiS,
      color: theme.colors.foregroundSecondary,
    },
    searchButton: {
      padding: theme.spacing.xs,
      minWidth: 44,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    searchInput: {
      paddingHorizontal: theme.spacing.m,
      paddingBottom: theme.spacing.s,
    },
  });

export const createSearchOverlayStyles = (theme: Theme) =>
  StyleSheet.create({
    overlayWrapper: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'flex-start',
      paddingTop: theme.spacing.xxl,
      paddingHorizontal: theme.spacing.m,
    },
    scrim: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme.colors.scrim,
    },
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.l,
      padding: theme.spacing.m,
      gap: theme.spacing.m,
      maxHeight: '70%',
      overflow: 'hidden',
    },
    inputWrapper: {
      borderWidth: theme.stroke.sm,
      borderColor: theme.colors.outline,
      borderRadius: theme.radius.l,
      backgroundColor: theme.colors.secondaryDefault,
      paddingHorizontal: theme.spacing.s,
      overflow: 'hidden',
    },
    inputWrapperFocused: {
      borderColor: theme.colors.primary,
    },
    input: {
      marginBottom: -theme.stroke.sm,
    },
    promptBody: {
      alignItems: 'center',
      gap: theme.spacing.xs,
      paddingVertical: theme.spacing.xl,
    },
    promptTitle: {
      ...theme.typography.titleM,
      color: theme.colors.foregroundPrimary,
      textAlign: 'center',
    },
    promptText: {
      ...theme.typography.bodyS,
      color: theme.colors.foregroundTertiary,
      textAlign: 'center',
    },
    loadingBody: {
      paddingVertical: theme.spacing.xl,
      alignItems: 'center',
    },
    noResultsBody: {
      alignItems: 'center',
      gap: theme.spacing.s,
      paddingVertical: theme.spacing.xl,
    },
    noResultsTitle: {
      ...theme.typography.titleM,
      color: theme.colors.foregroundPrimary,
      textAlign: 'center',
    },
    noResultsQuery: {
      color: theme.colors.primary,
    },
    noResultsHelper: {
      ...theme.typography.bodyS,
      color: theme.colors.foregroundTertiary,
      textAlign: 'center',
    },
    exploreCta: {
      marginTop: theme.spacing.s,
      paddingHorizontal: theme.spacing.l,
      paddingVertical: theme.spacing.s,
      borderRadius: theme.radius.l,
      borderWidth: theme.stroke.sm,
      borderColor: theme.colors.primary,
    },
    exploreCtaText: {
      ...theme.typography.uiM,
      color: theme.colors.primary,
    },
    resultsBody: {
      gap: theme.spacing.s,
    },
    resultsHeader: {
      ...theme.typography.titleS,
      color: theme.colors.foregroundPrimary,
    },
    resultRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.s,
    },
    resultAvatar: {
      width: 40,
      height: 40,
      borderRadius: theme.radius.m,
      backgroundColor: theme.colors.surfaceVariant,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    resultAvatarImage: {
      width: '100%',
      height: '100%',
    },
    resultBody: {
      flex: 1,
      gap: theme.spacing.xxs,
    },
    resultName: {
      ...theme.typography.titleS,
      color: theme.colors.foregroundPrimary,
    },
    resultSubtitle: {
      ...theme.typography.bodyS,
      color: theme.colors.foregroundSecondary,
    },
  });

export const createSheetStyles = (theme: Theme) =>
  StyleSheet.create({
    content: {
      padding: theme.spacing.m,
      gap: theme.spacing.m,
    },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.s,
    },
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: theme.spacing.s,
    },
    loginBody: {
      alignItems: 'center',
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.m,
    },
    loginIcon: {
      width: 56,
      height: 56,
      borderRadius: theme.radius.xxl,
      backgroundColor: theme.colors.secondaryContainer,
      alignItems: 'center',
      justifyContent: 'center',
    },
    loginTitle: {
      ...theme.typography.titleM,
      color: theme.colors.foregroundPrimary,
      textAlign: 'center',
    },
    loginMessage: {
      ...theme.typography.bodyS,
      color: theme.colors.foregroundSecondary,
      textAlign: 'center',
    },
  });
