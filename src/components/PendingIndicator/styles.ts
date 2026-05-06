import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

export const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingTop: 6,
    // Extra paddingBottom keeps the dot-row from sitting flush against
    // the chat input — when the keyboard is closed, the FlatList's
    // header spacer collapses to height: 0 and the indicator is
    // otherwise the very last visible row above the input.
    paddingBottom: 16,
    paddingHorizontal: 12,
    gap: 4,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});

export const createCountStyle = (theme: Theme) =>
  StyleSheet.create({
    count: {
      marginLeft: 4,
      fontSize: 11,
      color: theme.colors.onSurfaceVariant,
      opacity: 0.75,
    },
  });
