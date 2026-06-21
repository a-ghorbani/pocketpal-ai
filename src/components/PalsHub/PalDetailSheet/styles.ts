import {StyleSheet} from 'react-native';
import {Theme} from '../../../utils';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    // Pal Detail Sheet
    scrollContent: {
      paddingBottom: theme.spacing.ml,
    },
    headerSection: {
      padding: theme.spacing.ml,
      backgroundColor: theme.colors.surface,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: theme.spacing.m,
    },
    thumbnailContainer: {
      width: 80,
      height: 80,
      borderRadius: theme.radius.m,
      backgroundColor: theme.colors.surfaceVariant,
      marginRight: theme.spacing.m,
      overflow: 'hidden',
    },
    thumbnail: {
      width: '100%',
      height: '100%',
    },
    thumbnailPlaceholder: {
      width: '100%',
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.colors.surfaceVariant,
    },
    headerContent: {
      flex: 1,
    },
    title: {
      ...theme.typography.titleL,
      color: theme.colors.foregroundPrimary,
      marginBottom: theme.spacing.xs,
    },
    creator: {
      ...theme.typography.bodyS,
      color: theme.colors.foregroundSecondary,
      marginBottom: theme.spacing.s,
    },
    labelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: theme.spacing.s,
    },
    priceLabel: {
      ...theme.typography.titleS,
      marginRight: theme.spacing.sm,
    },
    freeLabel: {
      color: theme.colors.foregroundTertiary,
    },
    premiumLabel: {
      color: theme.colors.yellowHighestContrast,
    },
    statsSection: {
      paddingHorizontal: theme.spacing.ml,
      paddingVertical: theme.spacing.m,
    },
    statsRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
    },
    statItem: {
      alignItems: 'center',
      flex: 1,
    },
    statValue: {
      ...theme.typography.titleM,
      color: theme.colors.foregroundPrimary,
      marginBottom: theme.spacing.xs,
    },
    statLabel: {
      ...theme.typography.captionM,
      color: theme.colors.foregroundTertiary,
      textAlign: 'center',
    },
    ratingContainer: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    ratingText: {
      ...theme.typography.titleM,
      color: theme.colors.foregroundPrimary,
      marginLeft: theme.spacing.xs,
    },
    section: {
      paddingHorizontal: theme.spacing.ml,
      paddingVertical: theme.spacing.m,
    },
    sectionTitle: {
      ...theme.typography.titleM,
      color: theme.colors.foregroundPrimary,
      marginBottom: theme.spacing.sm,
    },
    description: {
      ...theme.typography.bodyM,
      color: theme.colors.foregroundPrimary,
    },
    tagsContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.s,
    },
    tag: {
      backgroundColor: theme.colors.surfaceVariant,
      borderRadius: theme.radius.ml,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
    },
    tagText: {
      ...theme.typography.bodyS,
      color: theme.colors.foregroundSecondary,
    },
    categoriesContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.s,
    },
    category: {
      backgroundColor: theme.colors.secondaryContainer,
      borderRadius: theme.radius.l,
      paddingHorizontal: theme.spacing.m,
      paddingVertical: theme.spacing.s,
    },
    categoryText: {
      ...theme.typography.uiM,
      color: theme.colors.onSecondaryContainer,
    },
    systemPromptContainer: {
      backgroundColor: theme.colors.surfaceVariant,
      borderRadius: theme.radius.m,
      padding: theme.spacing.m,
      marginTop: theme.spacing.s,
    },
    systemPrompt: {
      ...theme.typography.codeS,
      color: theme.colors.foregroundSecondary,
    },
    protectedContent: {
      backgroundColor: theme.colors.errorContainer,
      borderRadius: theme.radius.m,
      padding: theme.spacing.m,
      alignItems: 'center',
      marginTop: theme.spacing.s,
    },
    protectedText: {
      ...theme.typography.bodyS,
      color: theme.colors.onErrorContainer,
      textAlign: 'center',
      marginTop: theme.spacing.s,
    },
    primaryButton: {
      flex: 1,
      marginBottom: theme.spacing.sm,
    },
    // Buy button + its checkout feedback stack vertically and fill the row,
    // so a wide error/finalizing message never squeezes the button.
    buyActionColumn: {
      flex: 1,
    },
    buyButton: {
      alignSelf: 'stretch',
    },
    errorButton: {
      alignSelf: 'stretch',
      marginTop: theme.spacing.s,
    },
    errorContainer: {
      backgroundColor: theme.colors.errorContainer,
      borderRadius: theme.radius.s,
      padding: theme.spacing.sm,
      marginTop: theme.spacing.m,
    },
    errorText: {
      ...theme.typography.bodyS,
      color: theme.colors.onErrorContainer,
      textAlign: 'center',
    },
    divider: {
      marginVertical: theme.spacing.s,
    },
    accountLinkContainer: {
      marginTop: theme.spacing.sm,
      alignItems: 'center',
    },
    infoTextContainer: {
      marginTop: theme.spacing.m,
      alignItems: 'center',
      paddingHorizontal: theme.spacing.ml,
    },
    infoText: {
      ...theme.typography.bodyS,
      color: theme.colors.foregroundSecondary,
      textAlign: 'center',
      fontStyle: 'italic',
    },
  });
