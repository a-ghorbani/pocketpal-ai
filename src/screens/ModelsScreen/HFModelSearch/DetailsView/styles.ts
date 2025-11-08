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
    modelAuthor: {
      marginBottom: 0,
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
  });
