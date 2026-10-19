import React, {useMemo, useState} from 'react';
import {useTheme} from '../../hooks';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {StyleProp, View, ViewStyle} from 'react-native';
import {useBottomSheetInternal} from '@gorhom/bottom-sheet';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import {actionsBottomPadding, isLifted, paddingUpdate} from './actionsPadding';
import type {SheetContext} from './gorhomInternal';

interface ActionsProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

interface InSheetActionsProps {
  children: React.ReactNode;
  style: StyleProp<ViewStyle>;
  keyboardState: SheetContext['animatedKeyboardState'];
  position: SheetContext['animatedPosition'];
  detentsState: SheetContext['animatedDetentsState'];
  insetBottom: number;
}

const InSheetActions = ({
  children,
  style,
  keyboardState,
  position,
  detentsState,
  insetBottom,
}: InSheetActionsProps) => {
  const [initialPadding] = useState(() => {
    const keyboard = keyboardState.get();
    return actionsBottomPadding(insetBottom, {
      lifted: isLifted(
        keyboard.status,
        position.get(),
        detentsState.get().highestDetentPosition,
      ),
      heightWithinContainer: keyboard.heightWithinContainer,
    });
  });
  const padding = useSharedValue(initialPadding);

  useAnimatedReaction(
    () => {
      const {status, heightWithinContainer, easing, duration} =
        keyboardState.get();
      return {
        lifted: isLifted(
          status,
          position.get(),
          detentsState.get().highestDetentPosition,
        ),
        heightWithinContainer,
        easing,
        duration,
        inset: insetBottom,
      };
    },
    (next, prev) => {
      const update = paddingUpdate(prev, next);
      if (update.method === 'set') {
        padding.value = update.value;
      } else if (update.method === 'timing') {
        padding.value = withTiming(update.value, update.config);
      } else if (update.method === 'spring') {
        padding.value = withSpring(update.value, update.config);
      }
    },
    [insetBottom],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    paddingBottom: padding.value,
  }));

  return (
    <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>
  );
};

export const Actions = ({children, style}: ActionsProps) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const sheet = useBottomSheetInternal(true);

  const containerStyle: StyleProp<ViewStyle> = useMemo(() => {
    return {
      flexDirection: 'row',
      justifyContent: 'space-between',
      backgroundColor: theme.colors.background,
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 10 + insets.bottom,
      gap: 10,
    };
  }, [theme, insets]);

  if (!sheet) {
    return <View style={[containerStyle, style]}>{children}</View>;
  }

  return (
    <InSheetActions
      style={[containerStyle, style]}
      keyboardState={sheet.animatedKeyboardState}
      position={sheet.animatedPosition}
      detentsState={sheet.animatedDetentsState}
      insetBottom={insets.bottom}>
      {children}
    </InSheetActions>
  );
};
