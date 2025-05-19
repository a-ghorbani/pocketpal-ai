import React, {useState, useRef, useEffect} from 'react';
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

import LinearGradient from 'react-native-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
import {createStyles} from './styles';

// Enable LayoutAnimation for Android
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

enum BubbleState {
  PARTIAL = 'partial',
  EXPANDED = 'expanded',
}

interface ResponseBubbleProps {
  children?: React.ReactNode;
}

export const ResponseBubble: React.FC<ResponseBubbleProps> = ({children}) => {
  const styles = createStyles();

  const [bubbleState, setBubbleState] = useState<BubbleState>(
    BubbleState.EXPANDED,
  );

  // We don't need to track animation state anymore

  const chevronRotation = useRef(new Animated.Value(0)).current;

  // Reference to the ScrollView for auto-scrolling
  const scrollViewRef = useRef<ScrollView>(null);

  // Toggle between partial and expanded states
  const toggleState = () => {
    // Configure layout animation
    LayoutAnimation.configureNext({
      duration: 300,
      create: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
      },
      update: {
        type: LayoutAnimation.Types.spring,
        springDamping: 0.85,
      },
    });

    // Update state
    if (bubbleState === BubbleState.PARTIAL) {
      setBubbleState(BubbleState.EXPANDED);
      animateChevron(180);
    } else {
      setBubbleState(BubbleState.PARTIAL);
      animateChevron(0);
    }
  };

  // Animate chevron rotation
  const animateChevron = (toValue: number) => {
    Animated.timing(chevronRotation, {
      toValue,
      duration: 300,
      easing: Easing.bezier(0.2, 0, 0.2, 1),
      useNativeDriver: true,
    }).start();
  };

  // Chevron rotation interpolation
  const chevronRotationDeg = chevronRotation.interpolate({
    inputRange: [0, 180],
    outputRange: ['0deg', '180deg'],
  });

  const containerStyle = [
    styles.container,
    bubbleState === BubbleState.PARTIAL && styles.partialContainer,
    bubbleState === BubbleState.EXPANDED && styles.expandedContainer,
  ];

  const isScrollable = bubbleState === BubbleState.PARTIAL;

  // Auto-scroll to the bottom when content changes
  useEffect(() => {
    if (isScrollable && scrollViewRef.current) {
      // Use a longer timeout to ensure content is fully rendered
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({animated: true});
      }, 100);
    }
  }, [children, isScrollable]);

  return (
    <TouchableOpacity
      style={styles.shadowContainer}
      activeOpacity={0.9}
      onPress={toggleState}>
      <View style={containerStyle}>
        {/* Content */}
        {isScrollable ? (
          // Use MaskedView for partial state
          <MaskedView
            testID="masked-view"
            style={styles.maskedContentContainer}
            maskElement={
              <View style={styles.maskElementContainer}>
                <LinearGradient
                  style={styles.maskGradient}
                  colors={['transparent', 'black']}
                  pointerEvents="none"
                />
                <View style={styles.maskSolid} />
              </View>
            }>
            {/* The actual content that will be masked */}
            <ScrollView
              ref={scrollViewRef}
              style={styles.contentContainer}
              contentContainerStyle={styles.contentContainerStyle}
              showsVerticalScrollIndicator={false}
              // scrollEventThrottle={16}
              onContentSizeChange={() =>
                scrollViewRef.current?.scrollToEnd({animated: true})
              }
              // onLayout={() => {
              //   // Scroll when layout changes
              //   scrollViewRef.current?.scrollToEnd({animated: false});
              // }}
              // onContentSizeChange={() => {
              //   // First scroll without animation to ensure we reach the end
              //   scrollViewRef.current?.scrollToEnd({animated: false});
              //   // Then add a slight delay and scroll with animation for a smoother experience
              //   setTimeout(() => {
              //     scrollViewRef.current?.scrollToEnd({animated: true});
              //   }, 50);
              // }}
            >
              {children}
            </ScrollView>
          </MaskedView>
        ) : (
          // Full content view for expanded state
          <ScrollView
            style={styles.contentContainer}
            contentContainerStyle={styles.contentContainerStyle}
            showsVerticalScrollIndicator={false}
            scrollEventThrottle={16}>
            {children}
          </ScrollView>
        )}

        {/* Expand/Collapse indicator */}
        <View style={styles.indicatorContainer}>
          <Animated.View
            style={[
              styles.chevronContainer,
              {
                transform: [{rotate: chevronRotationDeg}],
              },
            ]}>
            <View style={styles.chevronIndicator} />
          </Animated.View>
        </View>
      </View>
    </TouchableOpacity>
  );
};

export default ResponseBubble;
