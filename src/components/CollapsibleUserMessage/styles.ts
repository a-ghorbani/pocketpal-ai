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
      bottom: 24, // above the toggle button
      height: 40,
      background: undefined, // RN doesn't support CSS gradient
      backgroundColor: 'transparent',
      // Use a semi-transparent overlay to hint at hidden content
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
