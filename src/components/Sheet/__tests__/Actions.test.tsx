import React from 'react';
import {render} from '@testing-library/react-native';
import {StyleProp, StyleSheet, Text, ViewStyle} from 'react-native';
import type {ReactTestRendererJSON} from 'react-test-renderer';
import {KEYBOARD_STATUS, useBottomSheetInternal} from '@gorhom/bottom-sheet';
import * as Reanimated from 'react-native-reanimated';
import {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {mockSheetContext} from '../../../../jest/sheetContext';

import {Actions} from '../Actions';

const mockUseBottomSheetInternal = useBottomSheetInternal as jest.Mock;
const mockUseSafeAreaInsets = useSafeAreaInsets as jest.Mock;
const INSET = 34;

const renderBar = (style?: object) =>
  render(
    <Actions style={style}>
      <Text>Cancel</Text>
      <Text>Save</Text>
    </Actions>,
  );

const barStyle = (utils: ReturnType<typeof renderBar>) =>
  StyleSheet.flatten(
    (utils.toJSON() as ReactTestRendererJSON).props
      .style as StyleProp<ViewStyle>,
  ) as ViewStyle;

describe('Actions', () => {
  beforeEach(() => {
    mockUseSafeAreaInsets.mockReturnValue({
      top: 0,
      right: 0,
      bottom: INSET,
      left: 0,
    });
  });

  afterEach(() => {
    mockUseBottomSheetInternal.mockImplementation(() => null);
    mockUseSafeAreaInsets.mockReturnValue({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    });
  });

  it('renders children correctly', () => {
    const {getByText} = renderBar();

    expect(getByText('Cancel')).toBeTruthy();
    expect(getByText('Save')).toBeTruthy();
  });

  describe('outside a sheet', () => {
    it('pads the bar above the bottom inset without an animated style', () => {
      const utils = renderBar();

      expect(barStyle(utils).paddingBottom).toBe(10 + INSET);
      expect(useAnimatedStyle).not.toHaveBeenCalled();
    });

    it("lets the caller's style win, padding included", () => {
      const utils = renderBar({paddingBottom: 3, paddingHorizontal: 4});

      expect(barStyle(utils)).toEqual(
        expect.objectContaining({paddingBottom: 3, paddingHorizontal: 4}),
      );
    });
  });

  describe('inside a sheet', () => {
    beforeEach(() => {
      (useSharedValue as jest.Mock).mockImplementation(init => ({
        value: init,
      }));
      (useAnimatedStyle as jest.Mock).mockImplementation(fn => fn());
      (withTiming as jest.Mock).mockClear();
      (withSpring as jest.Mock).mockClear();
    });

    afterEach(() => {
      (useSharedValue as jest.Mock).mockImplementation(() => ({value: 0}));
      (useAnimatedStyle as jest.Mock).mockImplementation(() => ({}));
      (useAnimatedStyle as jest.Mock).mockClear();
    });

    it.each([
      ['undetermined', {status: KEYBOARD_STATUS.UNDETERMINED}, 16, 10 + INSET],
      [
        'hidden',
        {status: KEYBOARD_STATUS.HIDDEN, heightWithinContainer: 300},
        0,
        10 + INSET,
      ],
      [
        'dropped',
        {status: KEYBOARD_STATUS.SHOWN, heightWithinContainer: 300},
        16,
        10 + INSET,
      ],
      [
        'lifted',
        {status: KEYBOARD_STATUS.SHOWN, heightWithinContainer: 300},
        0,
        10,
      ],
    ])(
      'starts at its %s padding without animating',
      (_, keyboardState, position, expected) => {
        mockUseBottomSheetInternal.mockReturnValue(
          mockSheetContext(
            {heightWithinContainer: 0, ...keyboardState},
            {position},
          ),
        );

        const utils = renderBar();

        expect(barStyle(utils).paddingBottom).toBe(expected);
        expect(withTiming).not.toHaveBeenCalled();
        expect(withSpring).not.toHaveBeenCalled();
      },
    );

    it('reads the sheet state once, not on every render', () => {
      const sheet = mockSheetContext({status: KEYBOARD_STATUS.HIDDEN});
      mockUseBottomSheetInternal.mockReturnValue(sheet);

      const utils = renderBar();
      utils.rerender(
        <Actions>
          <Text>Cancel</Text>
        </Actions>,
      );

      expect(sheet.animatedKeyboardState.get).toHaveBeenCalledTimes(1);
      expect(sheet.animatedPosition.get).toHaveBeenCalledTimes(1);
      expect(sheet.animatedDetentsState.get).toHaveBeenCalledTimes(1);
    });

    describe('keyboard reaction', () => {
      type Inputs = {
        lifted: boolean;
        heightWithinContainer: number;
        easing: string;
        duration: number;
        inset: number;
      };
      let prepare: () => Inputs;
      let react: (next: Inputs, prev: Inputs | null) => void;
      let deps: unknown[];
      let padding: {value: unknown};
      let reactionSpy: jest.SpyInstance;
      let sheet: ReturnType<typeof mockSheetContext>;

      const rest: Inputs = {
        lifted: false,
        heightWithinContainer: 0,
        easing: 'keyboard',
        duration: 0,
        inset: INSET,
      };
      const lifted = (easing: string): Inputs => ({
        ...rest,
        lifted: true,
        heightWithinContainer: 300,
        easing,
        duration: 250,
      });

      beforeEach(() => {
        reactionSpy = jest
          .spyOn(Reanimated, 'useAnimatedReaction')
          .mockImplementation((p, r, d) => {
            prepare = p as typeof prepare;
            react = r as typeof react;
            deps = d as unknown[];
          });
        (useSharedValue as jest.Mock).mockImplementation(init => {
          padding = {value: init};
          return padding;
        });
        sheet = mockSheetContext(
          {
            status: KEYBOARD_STATUS.SHOWN,
            heightWithinContainer: 280,
            easing: 'easeOut',
            duration: 120,
            target: 42,
          },
          {position: 0},
        );
        mockUseBottomSheetInternal.mockReturnValue(sheet);
        renderBar();
      });

      afterEach(() => {
        reactionSpy.mockRestore();
      });

      it('watches the lift, the keyboard fields and the inset, keyed on the inset', () => {
        expect(prepare()).toEqual({
          lifted: true,
          heightWithinContainer: 280,
          easing: 'easeOut',
          duration: 120,
          inset: INSET,
        });
        expect(deps).toEqual([INSET]);
      });

      it('reads a sheet dropped to its detent as not lifted', () => {
        sheet.position = 16;

        expect(prepare()).toEqual({
          lifted: false,
          heightWithinContainer: 280,
          easing: 'easeOut',
          duration: 120,
          inset: INSET,
        });
      });

      it('assigns the first value without animating', () => {
        expect(padding.value).toBe(10);

        react(rest, null);

        expect(padding.value).toBe(10 + INSET);
        expect(withTiming).not.toHaveBeenCalled();
        expect(withSpring).not.toHaveBeenCalled();
      });

      it('assigns an inset-only change without animating', () => {
        react({...rest, inset: 20}, rest);

        expect(padding.value).toBe(10 + 20);
        expect(withTiming).not.toHaveBeenCalled();
        expect(withSpring).not.toHaveBeenCalled();
      });

      it('times a lift whose keyboard event carries an easing curve', () => {
        const animation = {timing: true};
        (withTiming as jest.Mock).mockReturnValueOnce(animation);

        react(lifted('easeOut'), rest);

        expect(withTiming).toHaveBeenCalledWith(
          10,
          expect.objectContaining({duration: 250}),
        );
        expect(withSpring).not.toHaveBeenCalled();
        expect(padding.value).toBe(animation);
      });

      it("springs a lift on Android's 'keyboard' easing", () => {
        const animation = {spring: true};
        (withSpring as jest.Mock).mockReturnValueOnce(animation);

        react(lifted('keyboard'), rest);

        expect(withSpring).toHaveBeenCalledWith(
          10,
          expect.objectContaining({damping: 500, stiffness: 1000}),
        );
        expect(withTiming).not.toHaveBeenCalled();
        expect(padding.value).toBe(animation);
      });

      it('leaves the value alone when the padding would not change', () => {
        const before = padding.value;

        react({...lifted('easeOut'), duration: 0}, lifted('easeOut'));

        expect(padding.value).toBe(before);
        expect(withTiming).not.toHaveBeenCalled();
        expect(withSpring).not.toHaveBeenCalled();
      });
    });

    it('owns its bottom padding over the caller, and nothing else', () => {
      mockUseBottomSheetInternal.mockReturnValue(
        mockSheetContext({status: KEYBOARD_STATUS.HIDDEN}),
      );

      const utils = renderBar({paddingBottom: 3, paddingHorizontal: 4});

      expect(barStyle(utils)).toEqual(
        expect.objectContaining({
          paddingBottom: 10 + INSET,
          paddingHorizontal: 4,
        }),
      );
    });
  });
});
