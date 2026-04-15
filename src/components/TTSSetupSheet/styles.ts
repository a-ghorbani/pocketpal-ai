import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      padding: 16,
      paddingBottom: 32,
    },
    section: {
      marginBottom: 24,
    },
    sectionHeader: {
      fontWeight: 'bold',
      marginBottom: 4,
      color: theme.colors.onSurface,
    },
    sectionDescription: {
      marginBottom: 12,
      color: theme.colors.onSurfaceVariant,
    },
    installCard: {
      padding: 12,
      marginBottom: 12,
      borderRadius: 8,
      backgroundColor: theme.colors.surfaceContainerLow,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      overflow: 'hidden',
      position: 'relative',
    },
    installCardBody: {
      flex: 1,
      paddingRight: 12,
    },
    installCardTitle: {
      color: theme.colors.onSurface,
      fontWeight: '600',
    },
    installCardSubtitle: {
      color: theme.colors.onSurfaceVariant,
      marginTop: 2,
      fontSize: 12,
    },
    installCardProgressFill: {
      position: 'absolute',
      top: 0,
      left: 0,
      bottom: 0,
      backgroundColor: theme.colors.primaryContainer,
      opacity: 0.5,
    },
    installCardError: {
      backgroundColor: theme.colors.errorContainer,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      paddingHorizontal: 4,
      minHeight: 44,
    },
    rowDisabled: {
      opacity: 0.45,
    },
    rowVoiceName: {
      flex: 1,
      color: theme.colors.onSurface,
    },
    rowVoiceNameSelected: {
      fontWeight: 'bold',
    },
    previewButton: {
      marginLeft: 8,
    },
    emptyText: {
      padding: 12,
      color: theme.colors.onSurfaceVariant,
      fontStyle: 'italic',
    },
    stepsRow: {
      marginTop: 12,
      paddingVertical: 8,
    },
    stepsLabel: {
      color: theme.colors.onSurfaceVariant,
      marginBottom: 6,
      fontSize: 12,
    },
    heroRow: {
      padding: 16,
      marginBottom: 12,
      borderRadius: 12,
      backgroundColor: theme.colors.surfaceContainerLow,
    },
    heroRowBody: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    heroRowMain: {
      flex: 1,
      paddingRight: 12,
    },
    heroRowName: {
      color: theme.colors.onSurface,
      fontSize: 20,
      fontWeight: '700',
    },
    heroRowNameMuted: {
      color: theme.colors.onSurfaceVariant,
      fontSize: 20,
      fontWeight: '600',
    },
    heroChipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginTop: 6,
    },
    chip: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
      marginRight: 6,
      marginTop: 4,
      backgroundColor: theme.colors.surfaceContainer,
    },
    chipText: {
      color: theme.colors.onSurfaceVariant,
      fontSize: 11,
      fontWeight: '600',
    },
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
    primaryRowValue: {
      color: theme.colors.onSurfaceVariant,
      fontSize: 14,
      marginRight: 6,
    },
    groupHeader: {
      marginTop: 16,
      marginBottom: 4,
      paddingHorizontal: 4,
      color: theme.colors.onSurfaceVariant,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    voiceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 4,
      minHeight: 48,
    },
    voiceRowLabelBlock: {
      flex: 1,
      paddingRight: 8,
    },
    voiceRowName: {
      color: theme.colors.onSurface,
      fontSize: 15,
    },
    voiceRowNameSelected: {
      fontWeight: 'bold',
    },
    voiceRowSubline: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 2,
    },
    voiceRowEngineChipText: {
      color: theme.colors.onSurfaceVariant,
      fontSize: 11,
    },
    voiceRowCheck: {
      marginLeft: 8,
      color: theme.colors.primary,
      fontWeight: '700',
    },
    inlineInstallCta: {
      marginTop: 4,
      marginBottom: 8,
      marginHorizontal: 4,
      padding: 12,
      borderRadius: 8,
      backgroundColor: theme.colors.surfaceContainerLow,
      overflow: 'hidden',
      position: 'relative',
    },
    inlineInstallCtaText: {
      color: theme.colors.onSurface,
      fontSize: 13,
      marginBottom: 8,
    },
    inlineInstallCtaActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
    },
    secondaryHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 4,
      paddingHorizontal: 4,
      marginBottom: 8,
    },
    secondaryHeaderTitle: {
      marginLeft: 4,
      color: theme.colors.onSurface,
      fontSize: 18,
      fontWeight: '700',
    },
    engineRowWrap: {
      marginBottom: 16,
    },
    engineRowHeader: {
      color: theme.colors.onSurface,
      fontWeight: '600',
      fontSize: 15,
      marginBottom: 2,
    },
    engineRowSubline: {
      color: theme.colors.onSurfaceVariant,
      fontSize: 12,
      marginBottom: 8,
    },
    deleteButton: {
      alignSelf: 'flex-start',
      marginTop: 4,
    },
  });
