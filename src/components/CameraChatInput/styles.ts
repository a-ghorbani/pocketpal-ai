import {StyleSheet} from 'react-native';

export const createStyles = () =>
  StyleSheet.create({
    container: {
      width: '100%',
    },
    inputContainer: {
      width: '100%',
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
    },
    inputWrapper: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'flex-end',
    },
    palBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 8,
      marginBottom: 8,
    },
    inputInnerContainer: {
      flex: 1,
      marginRight: 8,
    },
    palNameWrapper: {
      fontSize: 12,
      marginBottom: 2,
    },
    palName: {
      fontWeight: 'bold',
    },
    input: {
      maxHeight: 120,
      paddingTop: 8,
      paddingBottom: 8,
      fontSize: 16,
    },
    actionButton: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
      marginBottom: 8,
    },
    actionButtonText: {
      color: 'white',
      fontWeight: 'bold',
    },
    marginRight: {
      marginRight: 8,
    },
  });
