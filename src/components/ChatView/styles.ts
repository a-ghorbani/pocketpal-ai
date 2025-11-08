import {StyleSheet} from 'react-native';
import {Theme} from '../../utils/types';

export const createStyles = ({theme}: {theme: Theme}) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    flatList: {
      height: '100%',
      // flex: 1,
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
    menu: {
      width: 170,
    },
    scrollToBottomButton: {
      position: 'absolute',
      right: 16,
      backgroundColor: theme.colors.primary,
      width: 35,
      height: 35,
      borderRadius: 20,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.25,
      shadowRadius: 3.84,
      elevation: 5,
    },
    inputContainer: {
      borderTopLeftRadius: theme.borders.inputBorderRadius,
      borderTopRightRadius: theme.borders.inputBorderRadius,
      position: 'absolute',
      zIndex: 10,
      left: 0,
      right: 0,
      bottom: 0,
      ...(!theme.dark
        ? {
            boxShadow: `0px -2px 8px ${theme.colors.shadow}1A`,
          }
        : {}),
    },
    chatContainer: {
      flex: 1,
      position: 'relative',
      backgroundColor: theme.colors.background,
      zIndex: 0,
    },
    headerWrapper: {
      zIndex: 100,
    },
    customBottomComponent: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
    },
  });
