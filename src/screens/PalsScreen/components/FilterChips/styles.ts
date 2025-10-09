import {StyleSheet} from 'react-native';
import {Theme} from '../../../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      backgroundColor: theme.colors.surface,
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.outline,
    },
    scrollContent: {
      paddingHorizontal: 16,
      gap: 8,
    },
    chip: {
      borderColor: theme.colors.outline,
      backgroundColor: theme.colors.surface,
      borderRadius: 20,
      height: 32,
    },
    activeChip: {
      backgroundColor: theme.colors.primaryContainer,
      borderColor: theme.colors.primary,
    },
    chipText: {
      fontSize: 12,
      fontWeight: '500',
      color: theme.colors.onSurfaceVariant,
    },
    activeChipText: {
      color: theme.colors.onPrimaryContainer,
      fontWeight: '600',
    },
  });
