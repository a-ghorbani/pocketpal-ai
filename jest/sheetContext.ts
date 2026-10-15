import type {KeyboardState} from '../src/components/Sheet/keyboardTarget';

export type MockSheetContext = ReturnType<typeof mockSheetContext>;

export const mockSheetContext = (initial: Partial<KeyboardState> = {}) => {
  const sheet = {
    keyboardState: {...initial},
    animatedKeyboardState: {
      get: jest.fn(() => sheet.keyboardState),
      set: jest.fn((next: Partial<KeyboardState>) => {
        sheet.keyboardState = next;
      }),
    },
    textInputNodesRef: {current: new Set<number>()},
  };
  return sheet;
};
