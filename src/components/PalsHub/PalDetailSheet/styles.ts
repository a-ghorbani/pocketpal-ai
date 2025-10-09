import {StyleSheet} from 'react-native';
import {Theme} from '../../../utils';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    // Pal Detail Sheet
    scrollContent: {
      paddingBottom: 20,
    },
    headerSection: {
      padding: 20,
      backgroundColor: theme.colors.surface,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 16,
    },
    thumbnailContainer: {
      width: 80,
      height: 80,
      borderRadius: 12,
      backgroundColor: theme.colors.surfaceVariant,
      marginRight: 16,
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
      fontSize: 24,
      fontWeight: '700',
      color: theme.colors.onSurface,
      marginBottom: 4,
      lineHeight: 28,
    },
    creator: {
      fontSize: 16,
      color: theme.colors.onSurfaceVariant,
      marginBottom: 8,
    },
    labelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
    },
    priceLabel: {
      fontSize: 16,
      fontWeight: '600',
      marginRight: 12,
    },
    freeLabel: {
      color: theme.colors.tertiary,
    },
    premiumLabel: {
      color: theme.colors.secondary,
    },
    statsSection: {
      paddingHorizontal: 20,
      paddingVertical: 16,
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
      fontSize: 18,
      fontWeight: '700',
      color: theme.colors.onSurface,
      marginBottom: 4,
    },
    statLabel: {
      fontSize: 12,
      color: theme.colors.onSurfaceVariant,
      textAlign: 'center',
    },
    ratingContainer: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    ratingText: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.colors.onSurface,
      marginLeft: 4,
    },
    section: {
      paddingHorizontal: 20,
      paddingVertical: 16,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.colors.onSurface,
      marginBottom: 12,
    },
    description: {
      fontSize: 16,
      lineHeight: 24,
      color: theme.colors.onSurface,
    },
    tagsContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    tag: {
      backgroundColor: theme.colors.surfaceVariant,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    tagText: {
      fontSize: 14,
      color: theme.colors.onSurfaceVariant,
    },
    categoriesContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    category: {
      backgroundColor: theme.colors.primaryContainer,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    categoryText: {
      fontSize: 14,
      fontWeight: '500',
      color: theme.colors.onPrimaryContainer,
    },
    systemPromptContainer: {
      backgroundColor: theme.colors.surfaceVariant,
      borderRadius: 12,
      padding: 16,
      marginTop: 8,
    },
    systemPrompt: {
      fontSize: 14,
      lineHeight: 20,
      color: theme.colors.onSurfaceVariant,
      fontFamily: 'monospace',
    },
    protectedContent: {
      backgroundColor: theme.colors.errorContainer,
      borderRadius: 12,
      padding: 16,
      alignItems: 'center',
      marginTop: 8,
    },
    protectedText: {
      fontSize: 14,
      color: theme.colors.onErrorContainer,
      textAlign: 'center',
      marginTop: 8,
    },
    primaryButton: {
      marginBottom: 12,
    },
    errorContainer: {
      backgroundColor: theme.colors.errorContainer,
      borderRadius: 8,
      padding: 12,
      marginTop: 16,
    },
    errorText: {
      fontSize: 14,
      color: theme.colors.onErrorContainer,
      textAlign: 'center',
    },
    divider: {
      marginVertical: 8,
    },
    accountLinkContainer: {
      marginTop: 12,
      alignItems: 'center',
    },
    infoTextContainer: {
      marginTop: 16,
      alignItems: 'center',
      paddingHorizontal: 20,
    },
    infoText: {
      fontSize: 14,
      color: theme.colors.onSurfaceVariant,
      textAlign: 'center',
      fontStyle: 'italic',
    },
  });
