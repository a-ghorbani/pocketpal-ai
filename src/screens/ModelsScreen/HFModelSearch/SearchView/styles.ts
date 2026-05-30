import {StyleSheet} from 'react-native';
import {Theme} from '../../../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    contentContainer: {
      flex: 1,
      justifyContent: 'space-between',
    },
    list: {
      padding: 16,
      paddingBottom: 100,
    },
    divider: {
      marginVertical: 12,
    },
    modelRow: {
      flexDirection: 'row',
      gap: 12,
      alignItems: 'flex-start',
    },
    avatarContainer: {
      width: 38,
      height: 38,
      borderRadius: 8,
      backgroundColor: theme.colors.surfaceVariant,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.outline,
    },
    avatar: {
      width: 38,
      height: 38,
    },
    avatarText: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.colors.onSurfaceVariant,
    },
    modelContent: {
      flex: 1,
      minWidth: 0,
    },
    authorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 2,
    },
    modelAuthor: {
      fontSize: 14,
      color: theme.colors.onSurfaceVariant,
      flexShrink: 1,
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
    modelDescription: {
      fontSize: 13,
      lineHeight: 18,
      color: theme.colors.onSurfaceVariant,
      marginBottom: 6,
    },
    statsContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 12,
      paddingLeft: 50,
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
    sourceChipText: {
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
