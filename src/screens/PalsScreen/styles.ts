import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

import {H_PADDING} from './palGridLayout';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.surface,
    },
    listContainer: {
      paddingHorizontal: H_PADDING,
      paddingTop: 16,
      paddingBottom: 100, // Extra space for bottom action bar
    },
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 64,
      paddingHorizontal: 32,
    },
    emptyStateText: {
      fontSize: 16,
      color: theme.colors.onSurfaceVariant,
      textAlign: 'center',
      marginTop: 16,
      lineHeight: 24,
    },
  });
