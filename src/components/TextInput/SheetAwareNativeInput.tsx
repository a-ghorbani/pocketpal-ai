import React, {useCallback, useEffect, useRef} from 'react';
import {
  findNodeHandle,
  Keyboard,
  TextInput as NativeTextInput,
  type TextInputInstance,
} from 'react-native';
import {useBottomSheetInternal} from '@gorhom/bottom-sheet';
import {useSafeAreaFrame} from 'react-native-safe-area-context';
import type {TextInputProps as PaperTextInputProps} from 'react-native-paper';

import type {SheetContext} from '../Sheet/gorhomInternal';
import {
  clearOwnKeyboardTarget,
  setKeyboardTarget,
  updateKeyboardTarget,
} from '../Sheet/keyboardTarget';
import {useAppWindowFillsScreen} from '../Sheet/screenSize';

type RenderProps = Parameters<NonNullable<PaperTextInputProps['render']>>[0];
type SheetAwareNativeInputProps = Omit<
  React.ComponentProps<typeof NativeTextInput>,
  'ref'
> & {ref?: React.Ref<TextInputInstance>};
type FocusEvent = Parameters<
  NonNullable<SheetAwareNativeInputProps['onFocus']>
>[0];

const InSheetInput = ({
  sheet: {animatedKeyboardState, textInputNodesRef},
  ref,
  onFocus,
  onBlur,
  ...props
}: SheetAwareNativeInputProps & {sheet: SheetContext}) => {
  const fillsScreen = useAppWindowFillsScreen();
  const {width: frameWidth} = useSafeAreaFrame();
  const input = useRef<TextInputInstance | null>(null);
  const focused = useRef(false);
  const previousWindow = useRef({fillsScreen, frameWidth});

  const setInput = useCallback(
    (instance: TextInputInstance | null) => {
      input.current = instance;
      if (typeof ref === 'function') {
        ref(instance);
      } else if (ref) {
        ref.current = instance;
      }
    },
    [ref],
  );

  useEffect(() => {
    const tag = findNodeHandle(input.current);
    if (!tag) {
      return;
    }
    const nodes = textInputNodesRef.current;
    nodes.add(tag);
    return () => {
      nodes.delete(tag);
      updateKeyboardTarget(animatedKeyboardState, clearOwnKeyboardTarget, tag);
    };
  }, [animatedKeyboardState, textInputNodesRef]);

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

  const focusStaysInSheet = () => {
    const next = findNodeHandle(
      NativeTextInput.State.currentlyFocusedInput() as unknown as TextInputInstance | null,
    );
    return !!next && textInputNodesRef.current.has(next);
  };

  const handleFocus = (event: FocusEvent) => {
    focused.current = true;
    if (fillsScreen) {
      updateKeyboardTarget(
        animatedKeyboardState,
        setKeyboardTarget,
        event.nativeEvent.target,
      );
    }
    onFocus?.(event);
  };

  const handleBlur = (event: FocusEvent) => {
    focused.current = false;
    if (!fillsScreen || !focusStaysInSheet()) {
      updateKeyboardTarget(
        animatedKeyboardState,
        clearOwnKeyboardTarget,
        event.nativeEvent.target,
      );
    }
    onBlur?.(event);
  };

  return (
    <NativeTextInput
      {...props}
      ref={setInput}
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
  <SheetAwareNativeInput {...(props as SheetAwareNativeInputProps)} />
);
