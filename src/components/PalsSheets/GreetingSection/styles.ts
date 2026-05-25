import {StyleSheet} from 'react-native';
import {Theme} from '../../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      gap: theme.spacing.default,
    },
    field: {
      gap: 4,
    },
    label: {
      ...theme.fonts.titleMediumLight,
      color: theme.colors.onSurface,
    },
    sublabel: {
      ...theme.fonts.bodySmall,
      color: theme.colors.onSurfaceVariant,
    },
    promptList: {
      gap: 8,
    },
    promptRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    promptInput: {
      flex: 1,
    },
    addButton: {
      alignSelf: 'flex-start',
      marginTop: 4,
    },
  });
