import {StyleSheet} from 'react-native';

import {Theme} from '../../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    stopLabel: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    settingItem: {
      marginBottom: 24,
      paddingHorizontal: 4,
    },
    settingLabel: {
      marginBottom: 2,
    },
    settingValue: {
      textAlign: 'right',
    },
    slider: {
      width: '100%',
      height: 40,
    },
    divider: {
      marginVertical: 16,
    },
    segmentedButtons: {
      marginTop: 8,
    },
    inputLabel: {
      flex: 1,
      fontSize: 16,
      marginRight: 8,
    },
    stopWordsContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 8,
    },
    stopChip: {
      marginRight: 4,
      marginVertical: 4,
    },
    stopChipText: {
      fontSize: 12,
    },
    description: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginTop: 2,
      marginBottom: 8,
    },
  });
