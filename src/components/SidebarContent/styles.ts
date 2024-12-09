import {StyleSheet} from 'react-native';

import {MD3Theme} from 'react-native-paper';

export const createStyles = (theme: MD3Theme) =>
  StyleSheet.create({
    sidebarContainer: {
      flex: 1,
      backgroundColor: theme.colors.surface,
    },
    contentWrapper: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
    },
    versionContainer: {
      paddingTop: 12,
      paddingBottom: 0,
      paddingHorizontal: 26,
      width: '100%',
      alignItems: 'center',
    },
    versionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      justifyContent: 'center',
    },
    versionLabel: {
      color: theme.colors.onSurfaceVariant,
      opacity: 0.4,
      fontSize: 12,
    },
    versionText: {
      color: theme.colors.onSurfaceVariant,
      opacity: 0.7,
      fontSize: 12,
      fontWeight: '500',
    },
    buildText: {
      color: theme.colors.onSurfaceVariant,
      opacity: 0.5,
      fontSize: 12,
    },
    copyHint: {
      fontSize: 10,
      color: theme.colors.onSurfaceVariant,
      opacity: 0.4,
      marginTop: 2,
      textAlign: 'center',
    },
    drawerSection: {
      marginVertical: 10,
    },
    dateLabel: {
      color: theme.colors.onSurfaceVariant,
      paddingLeft: 26,
      paddingBottom: 15,
    },
    scrollViewContent: {
      flexGrow: 1,
      minHeight: '100%',
    },
    mainContent: {
      flex: 1,
    },
    versionSafeArea: {
      backgroundColor: theme.colors.surface,
    },
  });
