import * as React from 'react';
import {
  Animated,
  GestureResponderHandlers,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {
  useComponentSize,
  useKeyboardDimensions,
  usePanResponder,
} from './hooks';

interface Props {
  children?: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  contentOffsetKeyboardClosed?: number;
  contentOffsetKeyboardOpened?: number;
  renderBackground?: () => React.ReactNode;
  renderScrollable: (panHandlers: GestureResponderHandlers) => React.ReactNode;
  scrollableContainerStyle?: StyleProp<ViewStyle>;
  spaceBetweenKeyboardAndAccessoryView?: number;
  style?: StyleProp<ViewStyle>;
  useListenersOnAndroid?: boolean;
}

export const KeyboardAccessoryView = React.memo(
  ({
    children,
    contentContainerStyle,
    contentOffsetKeyboardClosed,
    contentOffsetKeyboardOpened,
    renderBackground,
    renderScrollable,
    scrollableContainerStyle,
    spaceBetweenKeyboardAndAccessoryView,
    style,
    useListenersOnAndroid,
  }: Props) => {
    const {onLayout, size} = useComponentSize();
    const {keyboardEndPositionY, keyboardHeight} = useKeyboardDimensions(
      useListenersOnAndroid,
    );
    const {panHandlers, positionY} = usePanResponder();
    const {bottom, left, right} = useSafeAreaInsets();

    const deltaY = Animated.subtract(
      positionY,
      keyboardEndPositionY,
    ).interpolate({
      inputRange: [0, Number.MAX_SAFE_INTEGER],
      outputRange: [0, Number.MAX_SAFE_INTEGER],
      extrapolate: 'clamp',
    });

    const offset =
      size.height +
      keyboardHeight +
      (keyboardHeight > 0
        ? (contentOffsetKeyboardOpened ?? 0) - bottom
        : (contentOffsetKeyboardClosed ?? 0));

    return (
      <>
        <Animated.View
          style={[
            // eslint-disable-next-line react-native/no-inline-styles
            {
              flex: 1,
              paddingBottom: Animated.subtract(offset, deltaY),
            },
            scrollableContainerStyle,
          ]}>
          {renderScrollable(panHandlers)}
        </Animated.View>
        <Animated.View
          style={[
            {
              bottom: Animated.subtract(
                keyboardHeight > 0
                  ? keyboardHeight + (spaceBetweenKeyboardAndAccessoryView ?? 0)
                  : 0,
                deltaY,
              ),
            },
            styles.container,
            style,
          ]}
          testID="container">
          {renderBackground?.()}
          <View
            onLayout={onLayout}
            style={[
              styles.contentContainer,
              // eslint-disable-next-line react-native/no-inline-styles
              {
                marginBottom: keyboardHeight > 0 ? 0 : bottom,
                marginLeft: left,
                marginRight: right,
              },
              contentContainerStyle,
            ]}>
            {children}
          </View>
        </Animated.View>
      </>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  contentContainer: {
    flex: 1,
  },
});
