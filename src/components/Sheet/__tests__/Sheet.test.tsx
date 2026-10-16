import React from 'react';
import {BottomSheetModal} from '@gorhom/bottom-sheet';
import {
  useSafeAreaFrame,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import {render} from '../../../../jest/test-utils';

import {Sheet} from '../Sheet';

const fullScreenFrame = {x: 0, y: 0, width: 390, height: 844};
const PERCENT_SNAP_POINTS = ['50%'];

const setFrameHeight = (height: number) => {
  (useSafeAreaFrame as jest.Mock).mockReturnValue({...fullScreenFrame, height});
};

describe('Sheet', () => {
  beforeEach(() => {
    (useSafeAreaInsets as jest.Mock).mockReturnValue({
      top: 24,
      right: 0,
      bottom: 0,
      left: 0,
    });
  });

  afterEach(() => {
    (useSafeAreaInsets as jest.Mock).mockReturnValue({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    });
    (useSafeAreaFrame as jest.Mock).mockReturnValue(fullScreenFrame);
  });

  it('passes the top safe-area inset and resolved percentage snap points', () => {
    const {UNSAFE_getByType} = render(<Sheet snapPoints={['50%']} />);

    const modal = UNSAFE_getByType(BottomSheetModal);
    expect(modal.props.topInset).toBe(24);
    expect(modal.props.snapPoints).toEqual([fullScreenFrame.height / 2]);
  });

  it('resolves percentages against an app window shorter than the screen', () => {
    setFrameHeight(400);
    const {UNSAFE_getByType} = render(<Sheet snapPoints={['50%']} />);

    const modal = UNSAFE_getByType(BottomSheetModal);
    expect(modal.props.snapPoints).toEqual([200]);
    expect(modal.props.maxDynamicContentSize).toBe(360);
  });

  it('re-resolves percentages and the full-height cap when only the window resizes', () => {
    const {UNSAFE_getByType, rerender} = render(
      <Sheet snapPoints={PERCENT_SNAP_POINTS} />,
    );

    setFrameHeight(600);
    rerender(<Sheet snapPoints={PERCENT_SNAP_POINTS} />);

    const modal = UNSAFE_getByType(BottomSheetModal);
    expect(modal.props.snapPoints).toEqual([300]);
    expect(modal.props.maxDynamicContentSize).toBe(560);
  });

  it('keeps the full-height snap point', () => {
    const {UNSAFE_getByType} = render(<Sheet displayFullHeight />);

    expect(UNSAFE_getByType(BottomSheetModal).props.snapPoints).toEqual([
      fullScreenFrame.height - 24 - 16,
    ]);
  });

  it('enables dynamic sizing without snap points', () => {
    const {UNSAFE_getByType} = render(<Sheet />);

    const modal = UNSAFE_getByType(BottomSheetModal);
    expect(modal.props.snapPoints).toBeUndefined();
    expect(modal.props.enableDynamicSizing).toBe(true);
  });

  it('passes change and animate handlers through unchanged', () => {
    const onChange = jest.fn();
    const onAnimate = jest.fn();
    const {UNSAFE_getByType} = render(
      <Sheet onChange={onChange} onAnimate={onAnimate} />,
    );

    const modal = UNSAFE_getByType(BottomSheetModal);
    expect(modal.props.onChange).toBe(onChange);
    expect(modal.props.onAnimate).toBe(onAnimate);
  });
});
