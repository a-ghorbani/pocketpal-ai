import {I18nManager, StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    content: {
      flex: 1,
    },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginHorizontal: 16,
      marginBottom: 8,
      paddingHorizontal: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.outlineVariant,
      backgroundColor: theme.colors.surfaceContainerLow,
    },
    searchInput: {
      flex: 1,
      height: 44,
      color: theme.colors.onSurface,
      fontSize: 16,
      padding: 0,
      // TextInput is not auto-mirrored the way Text is, so this needs the
      // explicit ternary. See rowLabel.
      textAlign: I18nManager.isRTL ? 'right' : 'left',
    },
    list: {
      flex: 1,
    },
    listContent: {
      paddingBottom: 24,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 48,
      paddingVertical: 8,
      paddingHorizontal: 16,
    },
    rowLabel: {
      flex: 1,
      color: theme.colors.onSurface,
      fontSize: 16,
      // 'left' is how "start" is spelled: RN has no textAlign start/end, and
      // auto-mirrors left/right for Text. An isRTL ternary mirrors twice and
      // lands at the end.
      textAlign: 'left',
    },
    rowLabelSelected: {
      fontWeight: '700',
    },
    emptyText: {
      color: theme.colors.onSurfaceVariant,
      fontSize: 14,
      textAlign: 'left',
      paddingHorizontal: 16,
      paddingVertical: 16,
    },
  });
