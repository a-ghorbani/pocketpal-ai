import {StyleSheet} from 'react-native';
import {Theme} from '../../utils';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      marginVertical: 10,
      marginHorizontal: 16,
      alignSelf: 'stretch',
    },
    dividerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 6,
    },
    line: {
      flex: 1,
      height: 1,
      backgroundColor: theme.colors.outline,
      opacity: 0.35,
    },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.surfaceVariant,
      borderColor: theme.colors.outline,
      borderWidth: 1,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 6,
      marginHorizontal: 8,
      gap: 6,
    },
    title: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.colors.onSurface,
    },
    countText: {
      fontSize: 11,
      color: theme.colors.onSurfaceVariant,
    },
    focusTag: {
      alignSelf: 'center',
      backgroundColor: theme.colors.primaryContainer,
      borderRadius: 12,
      paddingHorizontal: 8,
      paddingVertical: 2,
      marginBottom: 6,
    },
    focusText: {
      fontSize: 11,
      color: theme.colors.onPrimaryContainer,
      fontStyle: 'italic',
    },
    summaryCard: {
      backgroundColor: theme.colors.surfaceVariant,
      borderRadius: 12,
      borderColor: theme.colors.outline,
      borderWidth: 1,
      padding: 12,
      marginTop: 4,
    },
    summaryHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    summaryLabel: {
      fontSize: 12,
      fontWeight: 'bold',
      color: theme.colors.primary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
  });
