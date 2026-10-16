import React, {useCallback, useEffect, useRef} from 'react';
import {findNodeHandle, TextInput as NativeTextInput} from 'react-native';
import {useBottomSheetInternal} from '@gorhom/bottom-sheet';
import type {TextInputProps as PaperTextInputProps} from 'react-native-paper';

import type {SheetContext} from '../Sheet/gorhomInternal';
import {
  clearOwnKeyboardTarget,
  setKeyboardTarget,
  updateKeyboardTarget,
} from '../Sheet/keyboardTarget';

type RenderProps = Parameters<NonNullable<PaperTextInputProps['render']>>[0];
type SheetAwareNativeInputProps = Omit<
  React.ComponentProps<typeof NativeTextInput>,
  'ref'
> & {ref?: React.Ref<NativeTextInput>};
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
  const input = useRef<NativeTextInput | null>(null);

  const setInput = useCallback(
    (instance: NativeTextInput | null) => {
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

  const focusStaysInSheet = () => {
    const next = findNodeHandle(
      NativeTextInput.State.currentlyFocusedInput() as unknown as NativeTextInput | null,
    );
    return !!next && textInputNodesRef.current.has(next);
  };

  const handleFocus = (event: FocusEvent) => {
    updateKeyboardTarget(
      animatedKeyboardState,
      setKeyboardTarget,
      event.nativeEvent.target,
    );
    onFocus?.(event);
  };

  const handleBlur = (event: FocusEvent) => {
    if (!focusStaysInSheet()) {
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
  <SheetAwareNativeInput {...props} />
);
