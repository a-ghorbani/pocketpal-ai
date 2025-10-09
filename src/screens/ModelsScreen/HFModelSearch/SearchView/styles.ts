import {StyleSheet} from 'react-native';
import {Theme} from '../../../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    contentContainer: {
      flex: 1,
    },
    list: {
      padding: 16,
      paddingBottom: 0,
    },
    divider: {
      marginVertical: 12,
    },
    modelAuthor: {
      fontSize: 14,
      color: theme.colors.onSurfaceVariant,
      marginBottom: 2,
    },
    modelNameContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 4,
      flexWrap: 'wrap',
    },
    modelName: {
      fontSize: 16,
      fontWeight: '500',
      color: theme.colors.onSurface,
    },
    statsContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    statItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    statText: {
      fontSize: 12,
      color: theme.colors.onSurfaceVariant,
    },
    noResultsText: {
      textAlign: 'center',
      marginTop: 20,
      fontSize: 16,
      color: theme.colors.onSurfaceVariant,
    },
    loadingMoreText: {
      textAlign: 'center',
      padding: 16,
      fontSize: 14,
      color: theme.colors.onSurfaceVariant,
    },
    gatedChipText: {
      fontSize: 10,
    },
    emptyStateContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 20,
      marginBottom: 20,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.colors.outline,
      borderRadius: 8,
      backgroundColor: theme.colors.surfaceVariant,
      width: '90%',
      alignSelf: 'center',
    },
    errorText: {
      color: theme.colors.error,
      marginTop: 8,
    },
    errorHintText: {
      color: theme.colors.onSurfaceVariant,
      marginTop: 8,
      textAlign: 'center',
      fontSize: 14,
      fontStyle: 'italic',
      paddingHorizontal: 20,
    },
    disableTokenButton: {
      marginTop: 10,
      alignSelf: 'center',
    },
  });
