import {StyleSheet} from 'react-native';
import {Theme} from '../../utils/types';

export const createStyles = ({theme}: {theme: Theme}) =>
  StyleSheet.create({
    sheetContainer: {
      backgroundColor: theme.colors.surface,
      flex: 1,
    },
    handle: {
      backgroundColor: theme.colors.outline,
      width: 40,
      height: 4,
      borderRadius: 2,
    },
    title: {
      fontSize: 20,
      fontWeight: '600',
      color: theme.colors.onSurface,
      textAlign: 'center',
      marginVertical: 16,
    },
    tabs: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      alignItems: 'center',
      height: 50,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.outline,
    },
    tab: {
      paddingVertical: 8,
      paddingHorizontal: 16,
      marginRight: 8,
      borderRadius: 8,
    },
    activeTab: {
      backgroundColor: theme.colors.primaryContainer,
    },
    tabText: {
      color: theme.colors.onSurface,
    },
    activeTabText: {
      color: theme.colors.onPrimaryContainer,
    },
    listItem: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.outline,
    },
    activeListItem: {
      backgroundColor: theme.colors.tertiaryContainer,
      borderColor: theme.colors.primary,
    },
    itemContent: {
      flex: 1,
      marginLeft: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    itemTextContent: {
      flex: 1,
    },
    settingsButton: {
      padding: 8,
      marginLeft: 8,
    },
    itemTitle: {
      fontSize: 16,
      color: theme.colors.onSurface,
      marginBottom: 4,
    },
    activeItemTitle: {
      color: theme.colors.onTertiaryContainer,
    },
    itemSubtitle: {
      fontSize: 14,
      color: theme.colors.onSurfaceVariant,
    },
    activeItemSubtitle: {
      color: theme.colors.onTertiaryContainer,
    },
    scrollviewContainer: {
      paddingBottom: theme.spacing.default,
    },
    tabList: {
      flexGrow: 0,
    },
  });
