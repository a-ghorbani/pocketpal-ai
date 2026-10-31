import type {KeyboardState} from '../src/components/Sheet/gorhomInternal';

export type MockSheetContext = ReturnType<typeof mockSheetContext>;

export const mockSheetContext = (
  initial: Partial<KeyboardState> = {},
  {
    position = 16,
    ...detents
  }: {position?: number; highestDetentPosition?: number} = {},
) => {
  const sheet = {
    keyboardState: {...initial},
    position,
    detentsState: {highestDetentPosition: 16, ...detents},
    animatedKeyboardState: {
      get: jest.fn(() => sheet.keyboardState),
      set: jest.fn((next: Partial<KeyboardState>) => {
        sheet.keyboardState = next;
      }),
    },
    animatedPosition: {get: jest.fn(() => sheet.position)},
    animatedDetentsState: {get: jest.fn(() => sheet.detentsState)},
    textInputNodesRef: {current: new Set<number>()},
  };
  return sheet;
};
