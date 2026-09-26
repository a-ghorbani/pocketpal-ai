import {StyleSheet} from 'react-native';

import {MD3Theme} from 'react-native-paper';

export const createStyles = (theme: MD3Theme) =>
  StyleSheet.create({
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    search: {marginHorizontal: 12, marginBottom: 8, borderRadius: 14},
    filterRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: 12,
      gap: 4,
    },
    folderHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingLeft: 20,
      paddingRight: 8,
    },
    folderHeading: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 44,
    },
    inlineIcon: {margin: 0},
    folderList: {maxHeight: 160, flexGrow: 0, marginHorizontal: 12},
    folderRow: {flexDirection: 'row', alignItems: 'center', borderRadius: 12},
    activeRow: {backgroundColor: theme.colors.secondaryContainer},
    folderTouchable: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 44,
      paddingLeft: 12,
      gap: 8,
    },
    folderTitle: {flex: 1},
    secondaryText: {color: theme.colors.onSurfaceVariant},
    emptyFolderButton: {alignSelf: 'flex-start'},
    filterContext: {
      paddingHorizontal: 20,
      paddingBottom: 8,
      color: theme.colors.primary,
    },
    historyHeading: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
    },
    historyList: {flex: 1},
    sessionTitle: {flex: 1, color: theme.colors.onSurface},
    sessionText: {flex: 1, gap: 2},
    sessionMain: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 12,
      gap: 6,
      minHeight: 48,
    },
    sessionActions: {margin: 0},
    emptyState: {padding: 24, gap: 12, alignItems: 'flex-start'},
    footer: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.outlineVariant,
      paddingVertical: 8,
      paddingHorizontal: 8,
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-around',
    },
    footerButton: {
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 6,
    },
    bulkActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-evenly',
      paddingBottom: 8,
    },
    dialogOverlay: {
      flex: 1,
      justifyContent: 'center',
      padding: 24,
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    dialogContent: {
      maxHeight: '85%',
      padding: 20,
      borderRadius: 24,
      backgroundColor: theme.colors.surface,
    },
    folderNameInput: {marginTop: 20},
    dialogActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'flex-end',
      gap: 8,
      marginTop: 16,
    },
    moveList: {maxHeight: 360, flexGrow: 0, marginTop: 12},
    sidebarContainer: {
      flex: 1,
      backgroundColor: theme.colors.surface,
    },
    divider: {
      marginHorizontal: 16,
      backgroundColor: theme.colors.onSurfaceVariant,
      height: 1,
      opacity: 0.1,
    },
    contentWrapper: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
    },
    sessionDrawerItem: {
      height: 40,
    },
    menuDrawerItem: {
      height: 44,
    },
    versionText: {
      color: theme.colors.onSurfaceVariant,
      opacity: 0.7,
      fontSize: 12,
      fontWeight: '500',
    },
    drawerSection: {
      marginTop: 10,
    },
    dateLabel: {
      paddingLeft: 16,
      paddingVertical: 10,
    },
    scrollViewContent: {
      flexGrow: 1,
    },
    mainContent: {
      flex: 1,
    },
    menu: {
      width: 220,
    },
    sessionItem: {
      position: 'relative',
    },
    sessionTouchable: {
      flex: 1,
    },
    // Selection mode styles
    selectionModeHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.outline,
      backgroundColor: theme.colors.surface,
    },
    selectedCountText: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.colors.onSurface,
      flex: 1,
      textAlign: 'center',
    },
    sessionItemContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      position: 'relative',
      borderRadius: 14,
      marginHorizontal: 12,
      marginVertical: 2,
    },
    sessionCheckbox: {
      marginLeft: 8,
      marginRight: 4,
    },
    menuDivider: {
      marginVertical: 4,
    },
    // Header action buttons (export, delete icons)
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    headerActionButton: {
      padding: 4,
    },
    headerActionButtonDisabled: {
      opacity: 0.4,
    },
    // Select all row
    selectAllRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 16,
      backgroundColor: theme.colors.surface,
    },
    selectAllCheckbox: {
      marginRight: 12,
    },
    selectAllText: {
      fontSize: 16,
      color: theme.colors.onSurface,
    },
    selectAllDivider: {
      backgroundColor: theme.colors.outline,
      opacity: 0.3,
    },
  });
