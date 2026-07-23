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
      // Ternary required: unlike <Text>, <TextInput> is not auto-mirrored, so
      // 'left' would stay left under RTL. ('start' is not a legal textAlign
      // value in RN.) 'auto' is wrong too — it aligns by first strong
      // character, flipping the field as soon as a Latin query is typed.
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
      // 'left' means "start" here. RN's textAlign has no start/end (unlike
      // CSS, and unlike RN's own paddingStart/marginStart), but it mirrors
      // left/right for <Text> under RTL, so 'left' lands at the layout start
      // in both directions. Writing isRTL ? 'right' : 'left' mirrors a second
      // time and pushes rows to the layout end. <TextInput> gets no such
      // mirroring, so searchInput does need the ternary.
      textAlign: 'left',
    },
    rowLabelSelected: {
      fontWeight: '700',
    },
    emptyText: {
      color: theme.colors.onSurfaceVariant,
      fontSize: 14,
      // Same mirroring rule as rowLabel — this string is localized, so
      // leaving it unset would natural-align it by first strong character.
      textAlign: 'left',
      paddingHorizontal: 16,
      paddingVertical: 16,
    },
  });
