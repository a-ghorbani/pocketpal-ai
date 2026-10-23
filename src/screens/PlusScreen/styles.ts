import {StyleSheet} from 'react-native';

import type {Theme} from '../../utils/types';
import {withOpacity} from '../../utils/colorUtils';

export const createStyles = (theme: Theme, compact: boolean) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    content: {
      paddingHorizontal: theme.spacing.ml,
      paddingBottom: theme.spacing.m,
    },
    topBar: {
      height: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginRight: -theme.spacing.sm,
      marginBottom: compact ? 0 : theme.spacing.s,
    },
    closeBtn: {
      width: 48,
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 24,
    },
    header: {
      gap: compact ? theme.spacing.xs : theme.spacing.s,
      marginBottom: compact ? theme.spacing.sm : theme.spacing.l,
    },
    eyebrow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xs,
    },
    eyebrowText: {
      ...theme.typography.uiM,
      color: theme.colors.secondary,
    },
    headline: {
      ...theme.typography.headlineH1,
      fontSize: compact ? 28 : 32,
      lineHeight: compact ? 34 : 40,
      color: theme.colors.onBackground,
    },
    subline: {
      ...theme.typography.bodyS,
      lineHeight: 21,
      color: theme.colors.onSurfaceVariant,
    },
    features: {
      borderRadius: theme.radius.l,
      borderWidth: theme.stroke.sm,
      borderColor: theme.dark
        ? theme.colors.outline
        : theme.colors.surfaceVariant,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: theme.spacing.m,
    },
    featureRow: {
      minHeight: compact ? 44 : 52,
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
    },
    featureDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.dark
        ? theme.colors.outline
        : theme.colors.surfaceVariant,
    },
    featureText: {
      flex: 1,
      paddingVertical: theme.spacing.xs,
    },
    featureName: {
      ...theme.typography.uiM,
      fontSize: 15,
      color: theme.colors.onBackground,
    },
    featureNote: {
      ...theme.typography.captionM,
      color: theme.colors.onSurfaceVariant,
    },
    featureNameMuted: {
      color: theme.colors.onSurfaceVariant,
    },
    status: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xs,
      flexShrink: 1,
    },
    statusText: {
      flexShrink: 1,
      ...theme.typography.uiS,
      fontSize: 13,
      color: theme.colors.onSurfaceVariant,
    },
    statusReady: {
      color: theme.colors.btnReadyText,
    },
    speedLine: {
      ...theme.typography.captionM,
      color: theme.colors.onSurfaceVariant,
      marginTop: theme.spacing.s,
      marginLeft: theme.spacing.xs,
      marginBottom: compact ? theme.spacing.m : theme.spacing.l,
    },
    priceCaption: {
      ...theme.typography.captionM,
      fontSize: 13,
      color: theme.colors.onSurfaceVariant,
      marginBottom: theme.spacing.s,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.s,
      marginBottom: compact ? theme.spacing.sm : theme.spacing.m,
    },
    tile: {
      flexBasis: '47%',
      flexGrow: 1,
      minHeight: compact ? 46 : 56,
      paddingVertical: theme.spacing.s,
      borderRadius: theme.radius.m,
      borderWidth: theme.stroke.sm,
      borderColor: theme.dark
        ? theme.colors.outline
        : theme.colors.surfaceVariant,
      backgroundColor: theme.colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tileSelected: {
      borderWidth: 2,
      borderColor: theme.colors.onBackground,
      backgroundColor: theme.colors.background,
    },
    tileText: {
      ...theme.typography.titleS,
      color: theme.colors.onBackground,
    },
    primaryBtn: {
      minHeight: 52,
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.m,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing.s,
      borderRadius: theme.radius.ml,
      backgroundColor: theme.colors.onBackground,
    },
    primaryBtnBusy: {
      backgroundColor: theme.colors.surfaceVariant,
    },
    primaryLabel: {
      ...theme.typography.titleS,
      color: theme.colors.background,
      textAlign: 'center',
      flexShrink: 1,
    },
    primaryLabelBusy: {
      color: theme.colors.onBackground,
    },
    notice: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: theme.spacing.s,
      padding: theme.spacing.sm,
      borderRadius: theme.radius.m,
      backgroundColor: theme.colors.surface,
      borderWidth: theme.stroke.sm,
      borderColor: theme.dark
        ? theme.colors.outline
        : theme.colors.surfaceVariant,
      marginBottom: theme.spacing.m,
    },
    noticeBody: {
      flex: 1,
    },
    noticeText: {
      ...theme.typography.bodyS,
      flex: 1,
      color: theme.colors.onBackground,
    },
    noticeSub: {
      ...theme.typography.captionM,
      color: theme.colors.onSurfaceVariant,
      marginTop: theme.spacing.xxs,
    },
    licence: {
      ...theme.typography.captionM,
      color: theme.colors.onSurfaceVariant,
      textAlign: 'center',
      marginBottom: theme.spacing.s,
    },
    restoreNote: {
      ...theme.typography.captionM,
      fontSize: 13,
      color: theme.colors.onSurfaceVariant,
      textAlign: 'center',
      marginTop: theme.spacing.s,
    },
    footer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: theme.spacing.xs,
    },
    footerText: {
      ...theme.typography.captionM,
      fontSize: 13,
      color: theme.colors.onSurfaceVariant,
      paddingHorizontal: theme.spacing.xxs,
    },
    footerGroup: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    footerDot: {
      ...theme.typography.captionM,
      fontSize: 13,
      color: theme.colors.onSurfaceVariant,
      paddingHorizontal: theme.spacing.xxs,
    },
    inlineError: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.s,
      marginBottom: theme.spacing.s,
    },
    inlineErrorText: {
      ...theme.typography.bodyS,
      flexShrink: 1,
      color: theme.colors.onBackground,
    },
    footerLink: {
      ...theme.typography.uiS,
      fontSize: 13,
      color: theme.colors.secondary,
    },
    footerHit: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xs,
      justifyContent: 'center',
      paddingHorizontal: theme.spacing.xxs,
    },
    thanksBadge: {
      width: compact ? 44 : 52,
      height: compact ? 44 : 52,
      borderRadius: 26,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withOpacity(theme.colors.secondary, 0.14),
      marginBottom: theme.spacing.s,
    },
  });
