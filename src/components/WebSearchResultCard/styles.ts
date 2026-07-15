import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

export const styles = ({theme}: {theme: Theme}) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 2,
    },
    label: {
      flexShrink: 1,
      marginHorizontal: 6,
      fontSize: 12,
      color: theme.colors.textSecondary,
      opacity: 0.85,
    },
  });

export const sheetStyles = ({theme}: {theme: Theme}) =>
  StyleSheet.create({
    container: {
      paddingHorizontal: 16,
      paddingTop: 8,
    },
    subtitle: {
      marginBottom: 12,
      fontSize: 13,
      color: theme.colors.onSurfaceVariant,
    },
    result: {
      marginBottom: 16,
    },
    title: {
      color: theme.colors.onSurface,
    },
    url: {
      marginTop: 2,
      fontSize: 11,
      color: theme.colors.onSurfaceVariant,
    },
    snippet: {
      marginTop: 4,
      fontSize: 12,
      color: theme.colors.onSurface,
    },
    empty: {
      fontSize: 12,
      color: theme.colors.onSurfaceVariant,
    },
    bottomSpacer: {
      height: 32,
    },
  });
