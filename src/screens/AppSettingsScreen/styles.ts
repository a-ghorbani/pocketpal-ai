import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    container: {
      padding: theme.spacing.m,
      gap: theme.spacing.sm,
    },
    group: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borders.default,
      paddingHorizontal: theme.spacing.m,
    },
    settingItemContainer: {
      paddingVertical: theme.spacing.m,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    textContainer: {
      flex: 1,
      marginEnd: theme.spacing.m,
    },
    labelWithIconContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: theme.spacing.xs,
    },
    settingIcon: {
      marginEnd: theme.spacing.s,
    },
    textLabel: {
      color: theme.colors.onSurface,
    },
    textDescription: {
      color: theme.colors.onSurfaceVariant,
    },
    menuContainer: {
      position: 'relative',
    },
    menuButton: {
      minWidth: 100,
    },
    buttonContent: {
      flexDirection: 'row-reverse',
      justifyContent: 'space-between',
    },
    menu: {
      width: 170,
    },
  });
