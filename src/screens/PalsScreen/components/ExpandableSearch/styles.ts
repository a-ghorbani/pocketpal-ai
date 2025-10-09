import {StyleSheet} from 'react-native';
import {Theme} from '../../../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      backgroundColor: theme.colors.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.outline,
      overflow: 'hidden',
    },
    searchContent: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 12,
    },
    searchInputContainer: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.surfaceContainerHigh,
      borderRadius: 24,
      paddingHorizontal: 16,
      paddingVertical: 8,
      gap: 8,
    },
    searchIcon: {
      opacity: 0.7,
    },
    searchInput: {
      flex: 1,
      fontSize: 16,
      color: theme.colors.onSurface,
      padding: 0,
      margin: 0,
      minHeight: 24,
    },
    clearButton: {
      padding: 4,
      borderRadius: 12,
    },
    searchActions: {
      flexDirection: 'row',
      gap: 8,
    },

    closeButton: {
      padding: 8,
      borderRadius: 20,
      backgroundColor: theme.colors.surfaceContainerHigh,
    },
  });
