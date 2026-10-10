import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      alignSelf: 'flex-start',
      maxWidth: '100%',
      paddingTop: 6,
      paddingBottom: 16,
      paddingHorizontal: 12,
      gap: 8,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    label: {
      flexShrink: 1,
      color: theme.colors.onSurfaceVariant,
    },
    barTrack: {
      width: 180,
      marginLeft: 22,
    },
    bar: {
      height: 3,
      borderRadius: 2,
    },
  });
