import {StyleSheet} from 'react-native';
import {Theme} from '../../../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      marginBottom: 16,
    },
    card: {
      backgroundColor: theme.colors.background,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.outline,
      // Add subtle shadow for depth (only in light mode)
      ...(theme.dark
        ? {}
        : {
            shadowColor: theme.colors.shadow,
            shadowOffset: {width: 0, height: 2},
            shadowOpacity: 0.05,
            shadowRadius: 8,
            elevation: 2,
          }),
    },
    cardContent: {
      padding: 12,
      aspectRatio: 1, // Square aspect ratio - ensures uniform card heights
      justifyContent: 'space-between', // Better space distribution
    },
    thumbnail: {
      width: '100%',
      height: 80, // Increased from 60px for better image display
      backgroundColor: theme.colors.primaryContainer,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8, // Reduced from 12px to save space
      position: 'relative',
      overflow: 'hidden',
    },
    thumbnailImage: {
      width: '100%',
      height: '100%',
      borderRadius: 12,
    },
    thumbnailOverlay: {
      position: 'absolute',
      bottom: 4,
      right: 4,
      backgroundColor: theme.colors.backdrop,
      borderRadius: 8,
      padding: 4,
      alignItems: 'center',
      justifyContent: 'center',
    },
    thumbnailText: {
      fontSize: 24,
      fontWeight: 'bold',
      color: theme.colors.onPrimaryContainer,
    },

    chatButton: {
      position: 'absolute',
      bottom: 6,
      right: 6,
      backgroundColor: theme.colors.surface,
      borderRadius: 14,
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
      // Add subtle shadow for prominence
      ...(theme.dark
        ? {
            borderWidth: 1,
            borderColor: theme.colors.outline,
          }
        : {
            shadowColor: theme.colors.shadow,
            shadowOffset: {width: 0, height: 2},
            shadowOpacity: 0.1,
            shadowRadius: 4,
            elevation: 3,
          }),
    },
    localBadge: {
      position: 'absolute',
      top: 4,
      right: 4,
      backgroundColor: theme.colors.primary,
      borderRadius: 10,
      width: 20,
      height: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    protectionBadge: {
      position: 'absolute',
      top: 4,
      left: 4,
      backgroundColor: theme.colors.tertiary,
      borderRadius: 8,
      width: 18,
      height: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    premiumBadge: {
      position: 'absolute',
      top: 16, // 12px card padding + 4px offset from thumbnail edge
      right: 16, // 12px card padding + 4px offset from thumbnail edge
      backgroundColor: theme.colors.secondary,
      borderRadius: 8,
      paddingHorizontal: 6,
      paddingVertical: 2,
      minWidth: 40,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10, // Ensure it appears above other elements
    },
    premiumBadgeText: {
      fontSize: 10,
      fontWeight: '600',
      color: theme.colors.onSecondary,
      letterSpacing: 0.1,
      textAlign: 'center',
    },
    content: {
      flex: 1,
      justifyContent: 'space-between',
      minHeight: 0, // Allow content to shrink
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      marginBottom: 2, // Reduced from 4px
      gap: 4,
      minHeight: 18, // Ensure minimum height for content
    },
    middleContent: {
      // Fixed height to ensure all cards have uniform height
      // This prevents cards from shrinking when description is short
      height: 60, // Enough for creator + description + warning
      justifyContent: 'flex-start',
    },
    palName: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.onSurface,
      flex: 1,
      lineHeight: 18,
      letterSpacing: 0.1, // Subtle letter spacing for better readability
    },
    priceContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceVariant,
      borderRadius: 8,
      paddingHorizontal: 6,
      paddingVertical: 2,
      minWidth: 40,
    },
    price: {
      fontSize: 10,
      fontWeight: '600',
      color: theme.colors.onSurfaceVariant,
      letterSpacing: 0.1,
      textAlign: 'center',
    },
    freePrice: {
      color: theme.colors.onTertiary,
    },
    premiumPrice: {
      color: theme.colors.onSecondary,
    },
    creator: {
      fontSize: 10, // Reduced from 11px
      color: theme.colors.onSurfaceVariant,
      marginBottom: 2, // Reduced from 4px
      fontWeight: '500',
      lineHeight: 12, // Tight line height
    },
    description: {
      fontSize: 11,
      color: theme.colors.onSurfaceVariant,
      lineHeight: 14,
      marginBottom: 4, // Reduced from 6px
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 4,
    },
    leftFooter: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    ratingContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    rating: {
      fontSize: 11,
      fontWeight: '600',
      color: theme.colors.onSurface,
    },
    reviewCount: {
      fontSize: 10,
      color: theme.colors.onSurfaceVariant,
      fontWeight: '500',
    },
    tagsContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      flex: 1,
      justifyContent: 'flex-end',
    },
    tag: {
      height: 18,
      borderColor: theme.colors.outline,
      borderRadius: 4,
      backgroundColor: theme.colors.surfaceContainerHigh,
    },
    tagText: {
      fontSize: 9,
      lineHeight: 11,
      fontWeight: '500',
    },
    moreTagsText: {
      fontSize: 9,
      color: theme.colors.onSurfaceVariant,
      fontWeight: '500',
    },
    nameSection: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 4,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    actionButton: {
      margin: 0,
      padding: 0,
      width: 24,
      height: 24,
    },
    warningContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: 6,
      backgroundColor: theme.colors.errorContainer + '20', // 20% opacity
      borderWidth: 0.5,
      borderColor: theme.colors.error + '40', // 40% opacity
      marginBottom: 4,
      // Add subtle glow effect in dark mode
      ...(theme.dark
        ? {
            shadowColor: theme.colors.error,
            shadowOffset: {width: 0, height: 0},
            shadowOpacity: 0.15,
            shadowRadius: 4,
          }
        : {}),
    },
    warningIcon: {
      margin: 0,
      padding: 0,
      width: 14,
      height: 14,
    },
    warningText: {
      flex: 1,
      fontSize: 9,
      lineHeight: 11,
      color: theme.colors.error,
      fontWeight: '500',
    },
  });
