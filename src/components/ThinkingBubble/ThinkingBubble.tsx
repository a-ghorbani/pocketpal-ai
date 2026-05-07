import React, {useState, useRef, useEffect, useContext} from 'react';
import {
  View,
  TouchableOpacity,
  Animated,
  Easing,
  ScrollView,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';

import {Text} from 'react-native-paper';
import LinearGradient from 'react-native-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
import {ChevronDownIcon} from '../../assets/icons';

import {useTheme} from '../../hooks';
import {L10nContext} from '../../utils';

import {createStyles} from './styles';

// Enable LayoutAnimation for Android
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

enum BubbleState {
  COLLAPSED = 'collapsed',
  PARTIAL = 'partial',
  EXPANDED = 'expanded',
}

interface ThinkingBubbleProps {
  children?: React.ReactNode;
  initiallyCollapsed?: boolean;
}

export const ThinkingBubble: React.FC<ThinkingBubbleProps> = ({
  children,
  initiallyCollapsed = false,
}) => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const styles = createStyles(theme);

  const [bubbleState, setBubbleState] = useState<BubbleState>(
    initiallyCollapsed ? BubbleState.COLLAPSED : BubbleState.PARTIAL,
  );

  // Track animation state to optimize rendering
  const [isAnimating, setIsAnimating] = useState(false);

  const chevronRotation = useRef(
    new Animated.Value(initiallyCollapsed ? 0 : 90),
  ).current;

  // Reference to the ScrollView for auto-scrolling
  const scrollViewRef = useRef<ScrollView>(null);

  const toggleState = () => {
    const isCollapsingTransition =
      bubbleState === BubbleState.EXPANDED ||
      bubbleState === BubbleState.PARTIAL;

    // Set animation flag to optimize rendering during transitions
    setIsAnimating(true);

    if (isCollapsingTransition) {
      // When collapsing, use a spring animation with bounce
      LayoutAnimation.configureNext(
        {
          duration: 450, // Longer duration
          create: {
            type: LayoutAnimation.Types.spring,
            property: LayoutAnimation.Properties.opacity,
            springDamping: 0.7, // Less damping for more bounce
          },
          update: {
            type: LayoutAnimation.Types.spring, // Bring back the spring for collapse
            springDamping: 0.7, // Less damping for more bounce
            initialVelocity: 0.5, // Higher initial velocity for more spring effect
          },
          delete: {
            type: LayoutAnimation.Types.spring,
            property: LayoutAnimation.Properties.opacity,
            springDamping: 0.7,
          },
        },
        () => {
          // Force a layout update after animation completes
          requestAnimationFrame(() => {
            // Mark animation as complete
            setIsAnimating(false);
          });
        },
      );
    } else {
      // When expanding, use a slower, more gradual animation
      LayoutAnimation.configureNext(
        {
          duration: 500, // Much longer duration for smoother expansion
          create: {
            type: LayoutAnimation.Types.easeInEaseOut,
            property: LayoutAnimation.Properties.opacity,
            //delay: 100, // Delay creation slightly
          },
          update: {
            type: LayoutAnimation.Types.spring,
            springDamping: 0.85, // Higher damping for less bounce
            initialVelocity: 0.3, // Lower initial velocity for gentler start
          },
        },
        // Add completion callback
        () => {
          requestAnimationFrame(() => {
            // Mark animation as complete
            setIsAnimating(false);
          });
        },
      );
    }

    // Update state
    switch (bubbleState) {
      case BubbleState.COLLAPSED:
        setBubbleState(BubbleState.PARTIAL);
        animateChevron(90);
        break;
      case BubbleState.PARTIAL:
        setBubbleState(BubbleState.EXPANDED);
        animateChevron(180);
        break;
      case BubbleState.EXPANDED:
        setBubbleState(BubbleState.COLLAPSED);
        animateChevron(0);
        break;
    }
  };

  // Animate chevron rotation with spring effect for collapsing
  const animateChevron = (toValue: number) => {
    // Determine if we're rotating to collapsed state (0 degrees)
    const isCollapsingRotation = toValue === 0;

    if (isCollapsingRotation) {
      // Use spring animation for collapsing to match the layout spring
      Animated.spring(chevronRotation, {
        toValue,
        friction: 8, // Lower friction for more bounce
        tension: 40, // Lower tension for more natural spring
        useNativeDriver: true,
      }).start();
    } else {
      // Use timing for expanding for more control
      Animated.timing(chevronRotation, {
        toValue,
        duration: 600, // Match the layout animation duration
        easing: Easing.bezier(0.2, 0, 0.2, 1), // Material standard for expand
        useNativeDriver: true,
      }).start();
    }
  };

  // Chevron rotation for each state
  const chevronRotationDeg = chevronRotation.interpolate({
    inputRange: [0, 90, 180],
    outputRange: ['0deg', '90deg', '180deg'],
  });

  const containerStyle = [
    styles.container,
    bubbleState === BubbleState.COLLAPSED && styles.collapsedContainer,
    bubbleState === BubbleState.PARTIAL && styles.partialContainer,
    bubbleState === BubbleState.EXPANDED && {},
  ];

  const isScrollable = bubbleState === BubbleState.PARTIAL;

  const isContentVisible = bubbleState !== BubbleState.COLLAPSED;

  // Scale animation for chevron on tap
  const chevronScale = useRef(new Animated.Value(1)).current;

  // Auto-scroll to the bottom when content changes
  useEffect(() => {
    // Only auto-scroll if we're in the partial state (scrollable)
    if (isScrollable && scrollViewRef.current) {
      // Use setTimeout to ensure the content has been rendered
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({animated: true});
      }, 100);
    }
  }, [children, isScrollable]); // Re-run when children or scrollable state changes

  // Animate chevron scale on state change
  const animateChevronScale = () => {
    // Determine if we're transitioning to collapsed state
    const isCollapsingTransition =
      bubbleState === BubbleState.EXPANDED ||
      bubbleState === BubbleState.PARTIAL;

    if (isCollapsingTransition) {
      // More spring-like scale effect when collapsing
      Animated.sequence([
        Animated.timing(chevronScale, {
          toValue: 1.2, // Moderate scale
          duration: 200, // Slightly faster for more responsive feel
          easing: Easing.out(Easing.cubic), // Cubic easing for quick expansion
          useNativeDriver: true,
        }),
        Animated.spring(chevronScale, {
          toValue: 1,
          friction: 7,
          tension: 40,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Very subtle scale effect when expanding
      Animated.sequence([
        Animated.timing(chevronScale, {
          toValue: 1.1,
          duration: 250,
          easing: Easing.bezier(0.4, 0, 0.2, 1),
          useNativeDriver: true,
        }),
        Animated.timing(chevronScale, {
          toValue: 1,
          duration: 350,
          easing: Easing.bezier(0, 0, 0.2, 1),
          useNativeDriver: true,
        }),
      ]).start();
    }
  };

  const handlePress = () => {
    toggleState();
    animateChevronScale();
  };

  return (
    <TouchableOpacity
      style={bubbleState !== BubbleState.COLLAPSED && styles.shadowContainer}
      activeOpacity={0.9}
      onPress={handlePress}>
      <View style={containerStyle}>
        {/* Header */}
        <View
          style={[
            styles.headerContainer,
            bubbleState === BubbleState.COLLAPSED &&
              styles.collapsedHeaderContainer,
          ]}>
          <Text variant="titleSmall" style={styles.headerText}>
            {l10n.components.thinkingBubble.reasoning}
          </Text>
          <Animated.View
            style={[
              styles.chevronContainer,
              bubbleState === BubbleState.COLLAPSED &&
                styles.collapsedChevronContainer, // Smaller chevron in collapsed state
              {
                transform: [
                  {rotate: chevronRotationDeg},
                  {scale: chevronScale},
                ],
              },
            ]}>
            <ChevronDownIcon
              testID="chevron-icon"
              width={bubbleState === BubbleState.COLLAPSED ? 16 : 18}
              height={bubbleState === BubbleState.COLLAPSED ? 16 : 18}
              stroke={theme.colors.thinkingBubbleText}
            />
          </Animated.View>
        </View>

        {/* Content */}
        {isContentVisible && (
          <>
            {/* When animating from collapsed to partial, use a simpler view for better performance */}
            {isScrollable && isAnimating ? (
              // Simple ScrollView without MaskedView during animation for better performance
              <ScrollView
                ref={scrollViewRef}
                style={styles.contentContainer}
                showsVerticalScrollIndicator={false}
                onContentSizeChange={() =>
                  scrollViewRef.current?.scrollToEnd({animated: true})
                }>
                {children}
              </ScrollView>
            ) : isScrollable ? (
              // Use MaskedView only when not animating from collapsed to partial
              <MaskedView
                testID="masked-view"
                style={styles.maskedContentContainer}
                maskElement={
                  <View style={styles.maskElementContainer}>
                    {/* This gradient is used as a mask - transparent areas will be see-through */}
                    <LinearGradient
                      style={styles.maskGradient}
                      colors={['transparent', 'black']}
                      pointerEvents="none"
                    />
                    {/* Solid black below the gradient ensures the rest of the content is fully visible */}
                    <View style={styles.maskSolid} />
                  </View>
                }>
                {/* The actual content that will be masked */}
                <ScrollView
                  ref={scrollViewRef}
                  style={styles.contentContainer}
                  showsVerticalScrollIndicator={false}
                  onContentSizeChange={() =>
                    scrollViewRef.current?.scrollToEnd({animated: true})
                  }>
                  {children}
                </ScrollView>
              </MaskedView>
            ) : (
              <View style={styles.contentContainer}>{children}</View>
            )}
          </>
        )}
      </View>
    </TouchableOpacity>
  );
};
