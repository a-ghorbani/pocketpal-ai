import {StyleSheet} from 'react-native';

import {Theme} from '../../../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    scrollView: {
      flex: 1,
      width: '100%',
      height: '100%',
      padding: 16,
    },
    scrollContent: {
      flexGrow: 1,
    },
    content: {
      flex: 1,
    },
    header: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 8,
    },
    list: {
      padding: 16,
      paddingTop: 0,
      paddingBottom: 100,
    },
    authorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 6,
      gap: 8,
    },
    avatarContainer: {
      width: 34,
      height: 34,
      borderRadius: 8,
      backgroundColor: theme.colors.surfaceVariant,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.outline,
    },
    avatar: {
      width: 34,
      height: 34,
    },
    avatarText: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.colors.onSurfaceVariant,
    },
    modelAuthor: {
      marginBottom: 0,
      flexShrink: 1,
    },
    titleContainer: {
      marginBottom: 10,
    },
    modelTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
    },
    modelTitle: {
      fontWeight: 'bold',
    },
    modelDescription: {
      color: theme.colors.onSurfaceVariant,
      marginBottom: 10,
      lineHeight: 18,
    },
    modelStats: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 4,
      marginBottom: 12,
    },
    stat: {
      backgroundColor: 'transparent',
      // backgroundColor: theme.colors.surfaceVariant,
    },
    statText: {
      fontSize: 10,
      // color: theme.colors.onSurfaceVariant,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      marginTop: 4,
      marginBottom: 8,
      color: theme.colors.onSurface,
    },
    sectionSubtitle: {
      fontSize: 16,
      fontWeight: '600',
      marginTop: 12,
      marginBottom: 4,
      color: theme.colors.onSurfaceVariant,
    },
    emptyStateContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 32,
      paddingHorizontal: 16,
      gap: 8,
    },
    emptyStateText: {
      color: theme.colors.onSurfaceVariant,
      textAlign: 'center',
    },
    errorText: {
      color: theme.colors.error,
      textAlign: 'center',
    },
  });
