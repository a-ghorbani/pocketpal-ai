import {StyleSheet} from 'react-native';
import {Theme} from '../../utils/types';

export const createStyles = ({theme}: {theme: Theme}) =>
  StyleSheet.create({
    container: {
      backgroundColor: theme.colors.background,
      flex: 1,
    },
    flatList: {
      backgroundColor: theme.colors.background,
      height: '100%',
    },
    flatListContentContainer: {
      flexGrow: 1,
    },
    footer: {
      height: 16,
    },
    footerLoadingPage: {
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 16,
      height: 32,
    },
    header: {
      height: 4,
    },
    keyboardAccessoryView: {
      backgroundColor: theme.colors.primary,
      borderTopLeftRadius: theme.borders.inputBorderRadius,
      borderTopRightRadius: theme.borders.inputBorderRadius,
    },
    menu: {
      width: 170,
    },
  });
