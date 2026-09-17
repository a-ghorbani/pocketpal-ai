import {StyleSheet} from 'react-native';

import {GAP} from '../../palGridLayout';

export const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: GAP,
  },
  // The parent is a row, so a flex property here grows the cell horizontally
  // and silently overrides the cardWidth composed onto it.
  cell: {},
});
