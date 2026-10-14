import React, {useEffect, useRef} from 'react';
import {Keyboard, TextInput as NativeTextInput} from 'react-native';
import {
  BottomSheetTextInput,
  useBottomSheetInternal,
} from '@gorhom/bottom-sheet';
import {runOnUI} from 'react-native-reanimated';
import {useSafeAreaFrame} from 'react-native-safe-area-context';
import type {TextInputProps as PaperTextInputProps} from 'react-native-paper';

import {useAppWindowFillsScreen} from '../Sheet/screenSize';

type RenderProps = Parameters<NonNullable<PaperTextInputProps['render']>>[0];
type SheetAwareNativeInputProps = React.ComponentProps<typeof NativeTextInput> &
  Partial<Pick<RenderProps, 'ref'>>;
type SheetContext = NonNullable<ReturnType<typeof useBottomSheetInternal>>;
type KeyboardStateValue = SheetContext['animatedKeyboardState'];
type FocusEvent = Parameters<
  NonNullable<SheetAwareNativeInputProps['onFocus']>
>[0];

// Queued on the UI runtime behind gorhom's own target write from the same
// focus handler; a JS-side get() would read the target before that write lands.
const clearKeyboardTargetIfOwn = (
  keyboardState: KeyboardStateValue,
  tag: number,
) => {
  'worklet';
  const state = keyboardState.get();
  if (state.target === tag) {
    keyboardState.set({...state, target: undefined});
  }
};

const InSheetInput = ({
  sheet,
  onFocus,
  onBlur,
  ...props
}: SheetAwareNativeInputProps & {sheet: SheetContext}) => {
  const fillsScreen = useAppWindowFillsScreen();
  const {width: frameWidth} = useSafeAreaFrame();
  const focused = useRef(false);
  const previousWindow = useRef({fillsScreen, frameWidth});

  useEffect(() => {
    const previous = previousWindow.current;
    previousWindow.current = {fillsScreen, frameWidth};
    if (
      focused.current &&
      fillsScreen !== previous.fillsScreen &&
      frameWidth !== previous.frameWidth
    ) {
      Keyboard.dismiss();
    }
  }, [fillsScreen, frameWidth]);

  const handleFocus = (event: FocusEvent) => {
    focused.current = true;
    if (!fillsScreen) {
      runOnUI(clearKeyboardTargetIfOwn)(
        sheet.animatedKeyboardState,
        event.nativeEvent.target,
      );
    }
    onFocus?.(event);
  };

  const handleBlur = (event: FocusEvent) => {
    focused.current = false;
    onBlur?.(event);
  };

  return (
    <BottomSheetTextInput
      {...props}
      onFocus={handleFocus}
      onBlur={handleBlur}
    />
  );
};

export const SheetAwareNativeInput = (props: SheetAwareNativeInputProps) => {
  const sheet = useBottomSheetInternal(true);
  if (sheet) {
    return <InSheetInput {...props} sheet={sheet} />;
  }
  return <NativeTextInput {...props} />;
};

export const renderSheetAwareInput = (props: RenderProps) => (
  <SheetAwareNativeInput {...props} />
);
