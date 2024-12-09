import {StyleSheet, Dimensions} from 'react-native';
import {Theme} from '../../utils/types';

export const SWIPE_WIDTH = Dimensions.get('window').width * 0.3; // 30% of screen width

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    leftActionContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      borderTopRightRadius: 24,
      borderBottomRightRadius: 24,
      shadowColor: theme.colors.shadow,
      shadowOffset: {
        width: 0,
        height: 1,
      },
      shadowOpacity: 0.25,
      shadowRadius: 1.84,
      elevation: 5,
      marginVertical: 4,
      marginRight: 4,
    },
    leftAction: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      width: SWIPE_WIDTH,
      padding: 16,
    },
    actionText: {
      color: theme.colors.onPrimary,
      marginTop: 4,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    leftActionsContainer: {
      width: SWIPE_WIDTH,
      flexDirection: 'row',
    },
  });
