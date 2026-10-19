import type {useBottomSheetInternal} from '@gorhom/bottom-sheet';

export type SheetContext = NonNullable<
  ReturnType<typeof useBottomSheetInternal>
>;
export type KeyboardStateValue = SheetContext['animatedKeyboardState'];
export type KeyboardState = ReturnType<KeyboardStateValue['get']>;
