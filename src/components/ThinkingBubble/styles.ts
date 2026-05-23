import {StyleSheet, Platform} from 'react-native';
import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) => {
  const bubbleBackground = theme.colors.thinkingBubbleBackground;
  const bubbleBorderColor = theme.colors.thinkingBubbleBorder;
  const textColor = theme.colors.thinkingBubbleText;
  const shadowColor = theme.colors.thinkingBubbleShadow;

  return StyleSheet.create({
    shadowContainer: {
      ...Platform.select({
        ios: {
          shadowColor: shadowColor,
          shadowOffset: {width: 0, height: 2},
          shadowOpacity: 0.4,
          shadowRadius: 12,
        },
        android: {
          // No need here, shadows come from elevation in the inner container
        },
      }),
    },
    container: {
      // Tightened from 16 → 6 (Idea G). With auto-collapse + text-only
      // collapsed state, the expanded card is rare; the original 16
      // bloated the layout for the common collapsed case.
      marginVertical: 6,
      borderRadius: 20,
      overflow: 'hidden',
      backgroundColor: bubbleBackground,
      borderWidth: 1,
      borderColor: bubbleBorderColor,
      // Platform-specific styles to ensure consistent layout behavior
      ...Platform.select({
        ios: {
          // No need here, shadows come from parrent container - overflow: 'hidden', will hide the shadow
        },
        android: {
          elevation: 8, // Moderate elevation
        },
      }),
    },
    collapsedContainer: {
      height: 30, // Reduced height for more compact appearance
      width: 140,
      alignSelf: 'flex-start',
      opacity: 0.65, // Slightly reduced opacity
      justifyContent: 'center',
      // Reduced shadow/elevation for collapsed state
      ...Platform.select({
        ios: {
          shadowOpacity: 0.2, // Reduced shadow
          shadowRadius: 6, // Smaller shadow radius
        },
        android: {
          elevation: 1, // Reduced elevation
        },
      }),
    },
    partialContainer: {
      height: 150,
    },
    headerContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderBottomWidth: 0,
      backgroundColor: 'transparent',
    },
    collapsedHeaderContainer: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      alignItems: 'center',
    },
    headerText: {
      color: textColor,
      letterSpacing: 0.5,
    },
    chevronContainer: {
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 14,
      backgroundColor: theme.colors.thinkingBubbleChevronBackground,
      borderWidth: 1,
      borderColor: theme.colors.thinkingBubbleChevronBorder,
    },
    collapsedChevronContainer: {
      width: 20,
      height: 20,
      borderRadius: 10,
    },
    contentContainer: {
      paddingHorizontal: 16,
      paddingBottom: 16,
      backgroundColor: 'transparent',
      borderRadius: 0,
    },
    // Absolute fill style for BlurView
    absoluteFill: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    maskedContentContainer: {
      flex: 1,
      position: 'relative',
      overflow: 'hidden',
      borderRadius: 0,
    },
    maskElementContainer: {
      flex: 1,
    },
    maskGradient: {
      height: 30,
      width: '100%',
    },
    maskSolid: {
      flex: 1,
      backgroundColor: 'black',
    },
    // Text-only collapsed state (Idea A): a single inline tappable
    // row, no card / no border / no shadow. Kept on the left edge so
    // it reads as a metadata annotation, not a chat bubble.
    collapsedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      //paddingVertical: 4,
      paddingHorizontal: 4,
      gap: 6,
    },
    collapsedRowLabel: {
      fontSize: 12,
      color: textColor,
      opacity: 0.75,
    },
  });
};
