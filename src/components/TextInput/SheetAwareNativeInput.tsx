import React from 'react';
import {TextInput as NativeTextInput} from 'react-native';
import {
  BottomSheetTextInput,
  useBottomSheetInternal,
} from '@gorhom/bottom-sheet';
import type {TextInputProps as PaperTextInputProps} from 'react-native-paper';

type RenderProps = Parameters<NonNullable<PaperTextInputProps['render']>>[0];

export const SheetAwareNativeInput = (props: RenderProps) => {
  const sheet = useBottomSheetInternal(true);
  if (sheet) {
    return <BottomSheetTextInput {...props} />;
  }
  return <NativeTextInput {...props} />;
};

export const renderSheetAwareInput = (props: RenderProps) => (
  <SheetAwareNativeInput {...props} />
);
