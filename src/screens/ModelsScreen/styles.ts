import {StyleSheet} from 'react-native';
import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      padding: 16,
      backgroundColor: theme.colors.background,
    },
    listContent: {
      paddingBottom: 24,
      gap: 12,
    },
    emptyContainer: {
      paddingVertical: 24,
    },
  });
