import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    body: {
      paddingHorizontal: 24,
      paddingBottom: 24,
      gap: 16,
    },
    cameraFill: {
      flex: 1,
    },
    camera: {
      height: 260,
      borderRadius: 12,
      overflow: 'hidden',
      backgroundColor: theme.colors.surfaceVariant,
    },
    hint: {
      fontSize: 14,
      color: theme.colors.onSurfaceVariant,
      textAlign: 'center',
    },
    url: {
      fontSize: 14,
      color: theme.colors.onSurface,
    },
    verdict: {
      gap: 4,
    },
    verdictText: {
      fontSize: 14,
      color: theme.colors.onSurface,
    },
    credentialText: {
      fontSize: 13,
      color: theme.colors.onSurfaceVariant,
    },
    errorText: {
      fontSize: 14,
      color: theme.colors.error,
    },
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 8,
    },
  });
