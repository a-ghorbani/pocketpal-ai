import {StyleSheet} from 'react-native';

import {Theme} from '../../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      borderRadius: 15,
      margin: 6,
      overflow: 'visible', // This ensures the badge can overflow the card
      position: 'relative',
      padding: 0,
    },
    hfBadge: {
      position: 'absolute',
      top: -11,
      right: -5,
      width: 24,
      height: 24,
      zIndex: 1,
      resizeMode: 'contain',
    },
    touchableRipple: {
      zIndex: 1,
    },
    cardInner: {},
    cardContent: {
      paddingTop: 8,
      paddingHorizontal: 15,
    },
    progressBar: {
      height: 8,
      borderRadius: 5,
      marginTop: 8,
    },
    actions: {
      paddingHorizontal: 15,
      paddingVertical: 0,
    },
    actionButton: {
      width: '33%',
    },
    settingsChevron: {
      margin: 0,
      marginLeft: -12,
    },
    errorText: {
      textAlign: 'center',
      marginBottom: 8,
    },
    downloadSpeed: {
      textAlign: 'right',
      fontSize: 12,
      marginTop: 5,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    modelInfoContainer: {
      flex: 1,
      marginRight: 8,
    },
    modelName: {
      fontSize: 16,
      fontWeight: 'bold',
      flexDirection: 'row',
      alignItems: 'center',
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    modelDescription: {
      fontSize: 12,
      marginTop: 2,
      color: theme.colors.onSurfaceVariant,
    },
    hfButton: {
      margin: 0,
      padding: 0,
      zIndex: 2,
    },
    settings: {
      //paddingHorizontal: 15,
    },
    warningContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      margin: 0,
    },
    warningContent: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    warningIcon: {
      marginLeft: 0,
      marginRight: 2,
    },
    warningText: {
      color: theme.colors.error,
      fontSize: 12,
    },
    overlayButtons: {
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'space-around',
    },
    downloadButton: {
      minWidth: 100,
      color: theme.colors.secondary,
    },
    removeButton: {
      minWidth: 100,
    },
    storageErrorText: {
      fontWeight: 'bold',
    },
    loadingContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 10,
      width: 100,
    },
    divider: {
      marginTop: 8,
    },
    settingsDialog: {
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
    dialogScrollArea: {
      paddingHorizontal: 0,
    },
    dialogContent: {
      paddingHorizontal: 16,
      backgroundColor: theme.colors.surface,
    },
    dialogActionButton: {
      minWidth: 80,
    },
  });
