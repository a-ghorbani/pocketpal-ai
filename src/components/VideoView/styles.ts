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
    closeButton: {
      padding: 15,
      borderRadius: 10,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    closeButtonText: {
      color: '#fff',
      fontSize: 16,
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
    permissionContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#000',
    },
    permissionText: {
      color: '#fff',
      fontSize: 16,
      marginBottom: 20,
      textAlign: 'center',
      paddingHorizontal: 20,
    },
    intervalControlsContainer: {
      position: 'absolute',
      top: 20,
      left: 0,
      right: 0,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 20,
    },
    intervalLabel: {
      color: '#fff',
      fontSize: 14,
      marginRight: 10,
    },
    intervalValue: {
      color: '#fff',
      fontSize: 14,
      marginHorizontal: 10,
      minWidth: 40,
      textAlign: 'center',
    },
    intervalButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    intervalButtonText: {
      color: '#fff',
      fontSize: 18,
      fontWeight: 'bold',
    },
    analysisContainer: {
      position: 'absolute',
      bottom: 100,
      left: 20,
      right: 20,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderRadius: 10,
      padding: 15,
      maxHeight: 150,
    },
    analysisText: {
      color: '#fff',
      fontSize: 14,
    },
  });
