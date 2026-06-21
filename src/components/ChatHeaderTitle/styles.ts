import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flexShrink: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    avatar: {
      width: 25,
      height: 25,
    },
    avatarImage: {
      width: 25,
      height: 25,
      borderRadius: 12.5,
    },
    avatarTile: {
      width: 25,
      height: 25,
      borderRadius: 12.5,
    },
    onlineDot: {
      position: 'absolute',
      end: -1,
      bottom: -1,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.colors.bgStatusActive,
      borderWidth: 1.5,
      borderColor: theme.colors.mutedBackground,
    },
    labels: {
      flexShrink: 1,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    title: {
      ...theme.typography.uiM,
      color: theme.colors.foregroundPrimary,
      flexShrink: 1,
    },
    model: {
      ...theme.typography.captionS,
      color: theme.colors.foregroundTertiary,
    },
  });
