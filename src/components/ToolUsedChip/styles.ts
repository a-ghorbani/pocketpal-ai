import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

export const styles = ({theme}: {theme: Theme}) =>
  StyleSheet.create({
    // Tightened (Idea C): smaller icon + label + reduced vertical
    // padding so the chip reads as a metadata annotation rather than
    // a UI element competing with bubbles.
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 0,
    },
    icon: {
      fontSize: 12,
      marginRight: 6,
      color: theme.colors.onSurfaceVariant,
      opacity: 0.75,
    },
    label: {
      fontSize: 11,
      color: theme.colors.onSurfaceVariant,
      opacity: 0.85,
    },
  });
