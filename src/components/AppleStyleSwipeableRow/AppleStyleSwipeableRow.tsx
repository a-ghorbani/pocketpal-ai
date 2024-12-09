import React, {useRef} from 'react';
import {Animated, View} from 'react-native';

import {Text} from 'react-native-paper';
import {RectButton, Swipeable} from 'react-native-gesture-handler';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import {useTheme} from '../../hooks';

import {createStyles, SWIPE_WIDTH} from './styles';

interface AppleStyleSwipeableRowProps {
  onDelete: () => void;
  onSwipeableOpen?: (direction: string) => void;
  onSwipeableClose?: (direction: string) => void;
  children: React.ReactNode;
}

export const AppleStyleSwipeableRow: React.FC<AppleStyleSwipeableRowProps> = ({
  onDelete,
  onSwipeableOpen,
  onSwipeableClose,
  children,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const swipeableRow = useRef<Swipeable>(null);

  const close = () => {
    swipeableRow.current?.close();
  };

  const renderLeftAction = (
    text: string,
    color: string,
    x: number,
    progress: Animated.AnimatedInterpolation<number>,
  ) => {
    const trans = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [-x, 0],
    });

    const pressHandler = () => {
      close();
      onDelete();
    };

    return (
      <Animated.View
        style={[
          styles.leftActionContainer,
          {
            transform: [{translateX: trans}],
            backgroundColor: color,
          },
        ]}>
        <RectButton style={styles.leftAction} onPress={pressHandler}>
          <Icon name="trash-can-outline" size={22} color="white" />
          <Text variant="bodySmall" style={styles.actionText}>
            {text}
          </Text>
        </RectButton>
      </Animated.View>
    );
  };

  const renderLeftActions = (
    progress: Animated.AnimatedInterpolation<number>,
    _dragAnimatedValue: Animated.AnimatedInterpolation<number>,
  ) => (
    <View style={styles.leftActionsContainer}>
      {renderLeftAction('Delete', theme.colors.error, SWIPE_WIDTH, progress)}
    </View>
  );

  return (
    <Swipeable
      ref={swipeableRow}
      friction={2}
      enableTrackpadTwoFingerGesture
      leftThreshold={30}
      renderLeftActions={renderLeftActions}
      onSwipeableOpen={onSwipeableOpen}
      onSwipeableClose={onSwipeableClose}>
      {children}
    </Swipeable>
  );
};
