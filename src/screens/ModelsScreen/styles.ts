import {StyleSheet} from 'react-native';
import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
    },
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    listContainer: {
      paddingBottom: 150,
    },
    filterChips: {
      flexDirection: 'row',
      gap: theme.spacing.s,
      paddingHorizontal: theme.spacing.m,
      paddingVertical: theme.spacing.sm,
    },
  });
