import {StyleSheet} from 'react-native';
import {Theme} from '../../utils/types';

export const COLLAPSED_HEIGHT_PX = 160; // 8 lines * ~20px per line

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    collapsedContent: {
      height: COLLAPSED_HEIGHT_PX,
      overflow: 'hidden',
    },
    fadeOverlay: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 24,
      height: 40,
      backgroundColor: 'transparent',
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.outlineVariant,
    },
    toggleButton: {
      alignSelf: 'flex-start',
      paddingVertical: 4,
      paddingHorizontal: 8,
      marginTop: 2,
    },
    toggleText: {
      fontSize: 12,
      color: theme.colors.primary,
      fontWeight: '600',
    },
  });
