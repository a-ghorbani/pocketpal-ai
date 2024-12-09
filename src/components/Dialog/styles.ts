import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    dialog: {
      maxHeight: '80%',
      backgroundColor: theme.colors.surface,
      borderRadius: 15,
      margin: 0,
      padding: 0,
    },
    dialogTitle: {
      fontSize: 16,
      fontWeight: 'bold',
    },
    dialogContent: {
      paddingHorizontal: 16,
      backgroundColor: theme.colors.surface,
    },
    dialogActionButton: {
      minWidth: 70,
    },
    actionsContainer: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      paddingHorizontal: 16,
      paddingBottom: 8,
    },
  });
