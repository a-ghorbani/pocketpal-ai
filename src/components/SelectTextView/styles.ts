import {StyleSheet} from 'react-native';
import {MD3Theme} from 'react-native-paper';

export const getStyles = (theme: MD3Theme) =>
  StyleSheet.create({
    modalContainer: {
      flex: 1,
      backgroundColor: theme.colors.background,
      padding: 16,
    },
    headerContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
    },
    headerText: {
      fontSize: 22,
      fontWeight: 'bold',
      color: theme.colors.primary,
      marginLeft: 16,
    },
    contentText: {
      color: theme.colors.primary,
      fontSize: 18,
      lineHeight: 24,
      marginTop: 5,
      maxWidth: '95%',
      alignSelf: 'center',
    },
    scrollViewContent: {
      flexGrow: 1,
      padding: 5,
    },
  });
