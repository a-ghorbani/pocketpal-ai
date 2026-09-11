import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme, bottomInset: number) =>
  StyleSheet.create({
    body: {
      paddingHorizontal: 24,
      paddingBottom: 10 + bottomInset,
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
      fontSize: 15,
      fontWeight: '600',
      color: theme.colors.onSurface,
    },
    notice: {
      fontSize: 13,
      color: theme.colors.onSurfaceVariant,
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
    actionsSplit: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    actionsRight: {
      flexDirection: 'row',
      gap: 8,
    },
  });
