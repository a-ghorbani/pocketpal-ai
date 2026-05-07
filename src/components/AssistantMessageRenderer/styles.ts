import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      maxWidth: '100%',
    },
    rawText: {
      color: theme.colors.text,
      fontSize: 16,
      lineHeight: 22,
    },
    structuredBlock: {
      maxWidth: '100%',
      marginVertical: 6,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.outlineVariant,
      borderRadius: 8,
      overflow: 'hidden',
      backgroundColor: theme.colors.surfaceContainerHigh,
    },
    structuredHeader: {
      minHeight: 40,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.outlineVariant,
    },
    structuredToggle: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    structuredChevron: {
      transform: [{rotate: '-90deg'}],
    },
    structuredChevronExpanded: {
      transform: [{rotate: '0deg'}],
    },
    structuredTitle: {
      flexShrink: 1,
      color: theme.colors.text,
      fontSize: 13,
      fontWeight: '600',
    },
    structuredLanguage: {
      color: theme.colors.textSecondary,
      fontSize: 12,
    },
    structuredCopyButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    structuredScroll: {
      maxWidth: '100%',
      backgroundColor: theme.colors.surface,
    },
    structuredScrollContent: {
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    structuredCodeText: {
      color: theme.colors.text,
      fontFamily: 'monospace',
      fontSize: 13,
      lineHeight: 18,
    },
    renderedSegmentBlock: {
      maxWidth: '100%',
      marginVertical: 6,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.outlineVariant,
      borderRadius: 8,
      overflow: 'hidden',
      backgroundColor: theme.colors.surface,
    },
    renderedSegmentHeader: {
      minHeight: 36,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      paddingLeft: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.outlineVariant,
      backgroundColor: theme.colors.surfaceContainerHigh,
    },
    renderedSegmentTitle: {
      flexShrink: 1,
      color: theme.colors.text,
      fontSize: 13,
      fontWeight: '600',
    },
    renderedSegmentActions: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    renderedSegmentCopyButton: {
      minHeight: 36,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
    },
    renderedSegmentCopyText: {
      color: theme.colors.textSecondary,
      fontSize: 12,
      fontWeight: '600',
    },
    renderedSegmentContent: {
      paddingHorizontal: 2,
      paddingVertical: 2,
    },
  });
