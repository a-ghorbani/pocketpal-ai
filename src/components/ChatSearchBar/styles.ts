import {I18nManager, StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.surface,
      borderBottomColor: theme.colors.outlineVariant,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    input: {
      flex: 1,
      fontSize: 16,
      paddingVertical: 4,
      color: theme.colors.onSurface,
      // TextInput is not auto-mirrored the way Text is, so this needs the
      // explicit ternary.
      textAlign: I18nManager.isRTL ? 'right' : 'left',
    },
    matchCount: {
      marginHorizontal: 4,
      color: theme.colors.onSurfaceVariant,
    },
    navButton: {
      padding: 4,
    },
  });
