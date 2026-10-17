import React from 'react';
import {Text, TextInput} from 'react-native';
import {render, act} from '@testing-library/react-native';

import {SheetScrollView} from '../SheetScrollView';

type MockScrollRef = {scrollTo: jest.Mock; getInnerViewRef: jest.Mock};

const layoutEvent = (height: number) => ({
  nativeEvent: {layout: {x: 0, y: 0, width: 300, height}},
});

const focusInput = (
  measureLayout: (
    relativeTo: unknown,
    onSuccess: (x: number, y: number, w: number, h: number) => void,
    onFail: () => void,
  ) => void,
) =>
  jest
    .spyOn(TextInput.State, 'currentlyFocusedInput')
    .mockReturnValue({measureLayout} as unknown as ReturnType<
      typeof TextInput.State.currentlyFocusedInput
    >);

const renderScrollView = () => {
  const ref = React.createRef<MockScrollRef>();
  const utils = render(
    <SheetScrollView ref={ref as never} testID="scroll">
      <Text>content</Text>
    </SheetScrollView>,
  );
  const scroll = utils.getByTestId('scroll');
  act(() => {
    scroll.props.onContentSizeChange(300, 1000);
    scroll.props.onLayout(layoutEvent(400));
  });
  return {ref, scroll};
};

const shrinkViewport = (
  scroll: ReturnType<typeof renderScrollView>['scroll'],
) =>
  act(() => {
    scroll.props.onLayout(layoutEvent(200));
    jest.runOnlyPendingTimers();
  });

describe('SheetScrollView', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('forwards scroll, layout and content-size events to the caller', () => {
    const onScroll = jest.fn();
    const onLayout = jest.fn();
    const onContentSizeChange = jest.fn();
    const {getByTestId} = render(
      <SheetScrollView
        testID="scroll"
        onScroll={onScroll}
        onLayout={onLayout}
        onContentSizeChange={onContentSizeChange}>
        <Text>content</Text>
      </SheetScrollView>,
    );
    const scroll = getByTestId('scroll');
    const scrollEvent = {nativeEvent: {contentOffset: {x: 0, y: 10}}};

    scroll.props.onScroll(scrollEvent);
    scroll.props.onLayout(layoutEvent(400));
    scroll.props.onContentSizeChange(300, 1000);

    expect(onScroll).toHaveBeenCalledTimes(1);
    expect(onScroll).toHaveBeenCalledWith(scrollEvent);
    expect(onLayout).toHaveBeenCalledTimes(1);
    expect(onLayout).toHaveBeenCalledWith(layoutEvent(400));
    expect(onContentSizeChange).toHaveBeenCalledTimes(1);
    expect(onContentSizeChange).toHaveBeenCalledWith(300, 1000);
  });

  it('passes the scroll view instance to object and callback refs', () => {
    const objectRef = React.createRef<MockScrollRef>();
    const callbackRef = jest.fn();

    render(
      <>
        <SheetScrollView ref={objectRef as never}>
          <Text>a</Text>
        </SheetScrollView>
        <SheetScrollView ref={callbackRef}>
          <Text>b</Text>
        </SheetScrollView>
      </>,
    );

    expect(objectRef.current?.scrollTo).toEqual(expect.any(Function));
    expect(callbackRef).toHaveBeenCalledWith(
      expect.objectContaining({scrollTo: expect.any(Function)}),
    );
  });

  it('scrolls the focused input into view when the viewport shrinks', () => {
    focusInput((_relativeTo, onSuccess) => onSuccess(0, 300, 280, 50));
    const {ref, scroll} = renderScrollView();

    shrinkViewport(scroll);

    expect(ref.current?.scrollTo).toHaveBeenCalledTimes(1);
    expect(ref.current?.scrollTo).toHaveBeenCalledWith({
      y: 150,
      animated: false,
    });
  });

  it('does not scroll for an input outside this scroll view', () => {
    focusInput((_relativeTo, _onSuccess, onFail) => onFail());
    const {ref, scroll} = renderScrollView();

    shrinkViewport(scroll);

    expect(ref.current?.scrollTo).not.toHaveBeenCalled();
  });

  it('does not scroll when the focused input is already inside the viewport', () => {
    focusInput((_relativeTo, onSuccess) => onSuccess(0, 100, 280, 50));
    const {ref, scroll} = renderScrollView();

    shrinkViewport(scroll);

    expect(ref.current?.scrollTo).not.toHaveBeenCalled();
  });

  it('does not scroll when the viewport grows', () => {
    const focused = jest
      .spyOn(TextInput.State, 'currentlyFocusedInput')
      .mockReturnValue(null as never);
    const {ref, scroll} = renderScrollView();
    act(() => {
      jest.runOnlyPendingTimers();
    });
    focused.mockReturnValue({
      measureLayout: (
        _relativeTo: unknown,
        onSuccess: (x: number, y: number, w: number, h: number) => void,
      ) => onSuccess(0, 700, 280, 50),
    } as never);

    act(() => {
      scroll.props.onLayout(layoutEvent(600));
      jest.runOnlyPendingTimers();
    });

    expect(ref.current?.scrollTo).not.toHaveBeenCalled();
  });

  it('keeps a growing input bottom edge in view while the keyboard is up', () => {
    let inputHeight = 50;
    focusInput((_relativeTo, onSuccess) => onSuccess(0, 100, 280, inputHeight));
    const {ref, scroll} = renderScrollView();
    shrinkViewport(scroll);
    expect(ref.current?.scrollTo).not.toHaveBeenCalled();

    inputHeight = 180;
    act(() => {
      scroll.props.onContentSizeChange(300, 1130);
      jest.runOnlyPendingTimers();
    });

    expect(ref.current?.scrollTo).toHaveBeenCalledTimes(1);
    expect(ref.current?.scrollTo).toHaveBeenCalledWith({
      y: 80,
      animated: false,
    });
  });

  it('coalesces triggers within a frame into one reveal on the latest geometry', () => {
    focusInput((_relativeTo, onSuccess) => onSuccess(0, 300, 280, 50));
    const {ref, scroll} = renderScrollView();

    act(() => {
      scroll.props.onLayout(layoutEvent(300));
      scroll.props.onLayout(layoutEvent(250));
      scroll.props.onLayout(layoutEvent(200));
      jest.runOnlyPendingTimers();
    });

    expect(ref.current?.scrollTo).toHaveBeenCalledTimes(1);
    expect(ref.current?.scrollTo).toHaveBeenCalledWith({
      y: 150,
      animated: false,
    });
  });

  it('measures the focused input against the scroll content view', () => {
    const measureLayout = jest.fn();
    focusInput(measureLayout);
    const {ref, scroll} = renderScrollView();

    shrinkViewport(scroll);

    expect(measureLayout).toHaveBeenCalledWith(
      ref.current?.getInnerViewRef.mock.results[0].value,
      expect.any(Function),
      expect.any(Function),
    );
  });

  it('does not scroll without a focused input', () => {
    jest
      .spyOn(TextInput.State, 'currentlyFocusedInput')
      .mockReturnValue(null as never);
    const {ref, scroll} = renderScrollView();

    shrinkViewport(scroll);

    expect(ref.current?.scrollTo).not.toHaveBeenCalled();
  });
});
