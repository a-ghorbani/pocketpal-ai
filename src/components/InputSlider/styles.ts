import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {},
    label: {
      color: theme.colors.onSurface,
    },
    description: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginTop: 2,
      marginBottom: 8,
    },
    controlRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    sliderContainer: {
      flex: 1,
      marginRight: 8,
    },
    slider: {},
    textInput: {},
    disabledTextInput: {
      opacity: 0.7,
      backgroundColor: theme.colors.surfaceDisabled,
    },
    rangeContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    rangeLabel: {
      ...theme.fonts.bodySmall,
      color: theme.colors.onSurfaceVariant,
    },
    disabledText: {
      color: theme.colors.onSurfaceDisabled,
    },
  });
