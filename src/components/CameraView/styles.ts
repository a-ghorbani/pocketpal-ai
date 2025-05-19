import {StyleSheet} from 'react-native';
import {Theme} from '../../utils/types';

export const createStyles = ({theme}: {theme: Theme}) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#000',
    },
    camera: {
      flex: 1,
    },
    controlsContainer: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingBottom: 40,
    },
    captureButton: {
      width: 70,
      height: 70,
      borderRadius: 35,
      backgroundColor: 'rgba(255, 255, 255, 0.3)',
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 2,
      borderColor: '#fff',
    },
    captureButtonInner: {
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: '#fff',
    },
    flipButton: {
      padding: 15,
      borderRadius: 10,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    flipButtonText: {
      color: '#fff',
      fontSize: 16,
    },
    closeButton: {
      padding: 15,
      borderRadius: 10,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    closeButtonText: {
      color: '#fff',
      fontSize: 16,
    },
    permissionContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.colors.background,
      padding: 20,
    },
    permissionText: {
      fontSize: 16,
      color: theme.colors.onBackground,
      textAlign: 'center',
      marginBottom: 20,
    },
  });
