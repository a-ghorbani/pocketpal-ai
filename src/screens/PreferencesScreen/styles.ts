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
    // Cap the value side of a settings row so a long value label ellipsizes
    // inside the button instead of squeezing the flex title/description
    // column into a sliver.
    menuContainer: {
      position: 'relative',
      flexShrink: 1,
      maxWidth: '55%',
    },
    menuButton: {
      minWidth: 100,
      maxWidth: '100%',
    },
    // A control too wide to share its row (e.g. the draft-model picker, whose
    // values are model filenames) sits under the title/description instead.
    // Also keeps the menu anchor at the row's left edge, on-screen.
    fullRowControl: {
      marginTop: theme.spacing.s,
      alignSelf: 'flex-start',
      maxWidth: '100%',
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
