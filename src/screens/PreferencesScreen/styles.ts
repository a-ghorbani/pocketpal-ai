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
    textLabel: {
      color: theme.colors.onSurface,
    },
    textDescription: {
      color: theme.colors.onSurfaceVariant,
    },
    textInput: {
      marginVertical: theme.spacing.s,
    },
    invalidInput: {
      borderColor: theme.colors.error,
      borderWidth: 1,
    },
    errorText: {
      color: theme.colors.error,
      marginTop: theme.spacing.xs,
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
    linkContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: theme.spacing.xs,
    },
    linkIcon: {
      marginStart: theme.spacing.xs,
    },
    segmentedButtons: {
      marginVertical: theme.spacing.s,
    },
  });
