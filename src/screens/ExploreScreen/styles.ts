import {StyleSheet} from 'react-native';

import type {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    header: {
      paddingHorizontal: theme.spacing.m,
      paddingTop: theme.spacing.m,
      paddingBottom: theme.spacing.s,
    },
    title: {
      ...theme.typography.headlineH1,
      color: theme.colors.foregroundPrimary,
    },
    promoCard: {
      marginHorizontal: theme.spacing.m,
      marginBottom: theme.spacing.m,
      padding: theme.spacing.l,
      borderRadius: theme.radius.ml,
      backgroundColor: theme.colors.yellowAccent,
      gap: theme.spacing.s,
    },
    promoTitle: {
      ...theme.typography.titleM,
      color: theme.colors.onYellowAccent,
    },
    promoSubtitle: {
      ...theme.typography.bodyS,
      color: theme.colors.onYellowAccent,
    },
    promoAction: {
      marginTop: theme.spacing.s,
      alignSelf: 'flex-start',
      backgroundColor: theme.colors.onYellowAccent,
    },
    promoActionLabel: {
      ...theme.typography.uiM,
      color: theme.colors.yellowHighestContrast,
    },
    tabs: {
      marginHorizontal: theme.spacing.m,
      marginBottom: theme.spacing.s,
    },
    panel: {
      flex: 1,
    },
    comingSoon: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: theme.spacing.l,
    },
    comingSoonText: {
      ...theme.typography.bodyM,
      color: theme.colors.foregroundTertiary,
      textAlign: 'center',
    },
  });
