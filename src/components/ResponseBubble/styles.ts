import {StyleSheet, Platform} from 'react-native';

export const createStyles = () => {
  // Colors
  const bubbleBackground = 'rgba(0, 0, 0, 0.7)';
  const bubbleBorderColor = 'rgba(255, 255, 255, 0.2)';
  const shadowColor = '#000';

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
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: bubbleBackground,
      borderWidth: 1,
      borderColor: bubbleBorderColor,
      ...Platform.select({
        ios: {
          // No need here, shadows come from parent container
        },
        android: {
          elevation: 8,
        },
      }),
    },
    partialContainer: {
      maxHeight: 120, // Limited height for partial view
    },
    expandedContainer: {
      // Full height for expanded view
    },
    contentContainer: {
      padding: 16,
      paddingBottom: 40, // Extra padding at bottom for indicator and to ensure content is visible
    },
    contentContainerStyle: {
      flexGrow: 1, // Allow content to grow and enable proper scrolling
    },
    maskedContentContainer: {
      height: 120, // Match the partialContainer maxHeight
    },
    maskElementContainer: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    maskGradient: {
      height: 40, // Height of the fade effect
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
    },
    maskSolid: {
      flex: 1,
      backgroundColor: 'black',
      marginTop: 40, // Match the maskGradient height
    },
    indicatorContainer: {
      position: 'absolute',
      bottom: 4,
      left: 0,
      right: 0,
      alignItems: 'center',
      justifyContent: 'center',
      height: 20,
    },
    chevronContainer: {
      width: 30,
      height: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chevronIndicator: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: 'rgba(255, 255, 255, 0.5)',
    },
  });
};

export default createStyles;
