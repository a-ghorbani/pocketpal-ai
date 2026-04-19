import {Platform, StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      padding: 16,
      paddingBottom: 32,
    },

    // Engine logo (used by EngineLogo)
    engineLogoCenter: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
    },
    engineLogoHalo: {
      position: 'absolute',
      left: -4,
      top: -4,
      opacity: 0.35,
    },
    engineLogoSurface: {
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    engineLogoSystemBadge: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Platform.OS === 'ios' ? '#F1F2F5' : '#E8F0E8',
    },
    engineLogoSystemBadgeDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: Platform.OS === 'ios' ? '#1A1A1A' : '#3DDC84',
    },

    // Engine groups (used by VoicePickerView)
    engineGroup: {
      marginBottom: 16,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.outlineVariant,
      backgroundColor: theme.colors.surface,
      overflow: 'hidden',
    },
    engineGroupGradientFill: {
      borderRadius: 18,
    },
    engineGroupHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 14,
    },
    engineGroupHeaderText: {
      flex: 1,
      paddingHorizontal: 12,
    },
    engineGroupTitle: {
      color: theme.colors.onSurface,
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: -0.2,
    },
    engineGroupTier: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      marginTop: 2,
    },
    engineGroupSpecs: {
      color: theme.colors.onSurfaceVariant,
      fontSize: 11,
      fontWeight: '500',
      fontVariant: ['tabular-nums'],
      letterSpacing: 0.2,
      marginTop: 1,
    },
    engineGroupDeleteBtn: {
      margin: 0,
    },
    engineGroupChevron: {
      width: 22,
      height: 22,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 4,
    },
    engineGroupChevronExpanded: {
      transform: [{rotate: '90deg'}],
    },
    engineGroupBody: {
      paddingHorizontal: 14,
      paddingBottom: 14,
      paddingTop: 4,
    },
    engineGroupCta: {
      borderRadius: 12,
    },
    engineGroupCtaLabel: {
      fontSize: 14,
      fontWeight: '700',
      letterSpacing: 0.1,
    },
    engineGroupProgressText: {
      color: theme.colors.onSurface,
      fontSize: 13,
      fontWeight: '600',
      fontVariant: ['tabular-nums'],
      letterSpacing: 0.2,
      paddingVertical: 8,
    },
    engineGroupErrorText: {
      color: theme.colors.error,
      fontSize: 12.5,
      lineHeight: 17,
      marginBottom: 10,
    },
    engineGroupHintText: {
      color: theme.colors.onSurfaceVariant,
      fontSize: 12,
      lineHeight: 16,
      opacity: 0.7,
    },
    engineGroupEmpty: {
      color: theme.colors.onSurfaceVariant,
      fontSize: 12.5,
      fontStyle: 'italic',
      paddingVertical: 8,
    },
    engineGroupTagline: {
      color: theme.colors.onSurfaceVariant,
      fontSize: 12.5,
      lineHeight: 18,
      marginBottom: 12,
    },

    // Hero row (used by HeroRow)
    heroRow: {
      padding: 14,
      marginBottom: 14,
      borderRadius: 18,
      borderWidth: 1,
      backgroundColor: theme.colors.surfaceContainerLow,
    },
    heroRowBody: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    heroAvatarWrap: {
      marginRight: 14,
    },
    heroRowMain: {
      flex: 1,
      paddingRight: 12,
    },
    heroRowName: {
      color: theme.colors.onSurface,
      fontSize: 26,
      fontWeight: '700',
      letterSpacing: -0.3,
    },
    heroSubtitle: {
      color: theme.colors.onSurfaceVariant,
      fontSize: 12,
      fontWeight: '600',
      marginTop: 4,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    heroPreviewButton: {
      margin: 0,
    },
    heroQualityBlock: {
      marginTop: 14,
      paddingHorizontal: 2,
    },
    heroQualityLabel: {
      color: theme.colors.onSurfaceVariant,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      marginBottom: 8,
    },

    // Voice rows (used by VoicePickerView)
    voiceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 4,
      paddingLeft: 4,
      paddingRight: 4,
      minHeight: 48,
    },
    voiceRowLabelBlock: {
      flex: 1,
      paddingLeft: 8,
      paddingRight: 8,
    },
    voiceRowPreviewBtn: {
      margin: 0,
    },
    voiceRowName: {
      color: theme.colors.onSurface,
      fontSize: 16,
      fontWeight: '500',
    },
    voiceRowNameSelected: {
      fontWeight: '700',
    },

    voicesEmptyHint: {
      color: theme.colors.onSurfaceVariant,
      fontSize: 12.5,
      lineHeight: 18,
      marginBottom: 16,
      paddingHorizontal: 4,
    },

    // Primary settings rows (used by AutoSpeakRow)
    primaryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      paddingHorizontal: 4,
      minHeight: 52,
    },
    primaryRowLabelBlock: {
      flex: 1,
      paddingRight: 12,
    },
    primaryRowLabel: {
      color: theme.colors.onSurface,
      fontSize: 16,
    },
    primaryRowDescription: {
      color: theme.colors.onSurfaceVariant,
      fontSize: 12,
      marginTop: 2,
    },
  });
