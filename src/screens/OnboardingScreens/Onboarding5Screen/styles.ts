import {StyleSheet} from 'react-native';

import type {Theme} from '../../../utils/types';
import {FONT_FAMILIES} from '../../../theme/tokens/typography';

export const createStyles = (theme: Theme) => {
  const isFraunces =
    theme.typography.headlineH1.fontFamily === FONT_FAMILIES.FRAUNCES_MEDIUM;
  return StyleSheet.create({
    header: {
      width: 369,
      alignItems: 'center',
      gap: theme.spacing.sm,
    },
    title: {
      // Figma `Headline/H2` — Fraunces Medium 24/28, centered.
      fontFamily: isFraunces
        ? FONT_FAMILIES.FRAUNCES_MEDIUM
        : FONT_FAMILIES.INTER_MEDIUM,
      fontSize: 24,
      lineHeight: 28,
      color: theme.colors.onBackground,
      textAlign: 'center',
      width: 279,
    },
    body: {
      ...theme.typography.bodyS,
      color: theme.colors.onSurfaceVariant,
      textAlign: 'center',
    },
    elseTagline: {
      alignItems: 'center',
      gap: theme.spacing.xs,
      marginTop: theme.spacing.l,
    },
    elseTaglineTitle: {
      ...theme.typography.bodyM,
      color: theme.colors.onBackground,
      textAlign: 'center',
    },
    elseTaglineHint: {
      ...theme.typography.bodyS,
      color: theme.colors.onSurfaceVariant,
      textAlign: 'center',
    },
  });
};
