import React, {forwardRef, memo, useCallback, useEffect, useRef} from 'react';
import {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollViewProps,
  TextInput,
  type HostInstance,
} from 'react-native';
import {
  BottomSheetScrollView,
  type BottomSheetScrollViewMethods,
} from '@gorhom/bottom-sheet';
import type {BottomSheetScrollViewProps} from '@gorhom/bottom-sheet/src/components/bottomSheetScrollable/types';

import {revealOffset} from './revealOffset';

type ScrollViewInstance = BottomSheetScrollViewMethods & {
  getInnerViewRef(): HostInstance | null;
};

type ChainedCallbacks = 'onScroll' | 'onLayout' | 'onContentSizeChange';

export type SheetScrollViewProps = Omit<
  BottomSheetScrollViewProps,
  'ref' | 'children' | ChainedCallbacks
> &
  Pick<ScrollViewProps, 'children' | ChainedCallbacks>;

const SheetScrollViewComponent = forwardRef<
  BottomSheetScrollViewMethods,
  SheetScrollViewProps
>(({children, onScroll, onLayout, onContentSizeChange, ...props}, ref) => {
  const scrollRef = useRef<ScrollViewInstance | null>(null);
  const geometry = useRef({offsetY: 0, viewportHeight: 0, contentHeight: 0});
  const pendingFrame = useRef<number | null>(null);

  const reveal = useCallback(() => {
    pendingFrame.current = null;
    const scroll = scrollRef.current;
    const innerView = scroll?.getInnerViewRef();
    const focused = TextInput.State.currentlyFocusedInput();
    if (!scroll || !innerView || !focused) {
      return;
    }
    focused.measureLayout(
      innerView,
      (_x, inputY, _width, inputHeight) => {
        const y = revealOffset({inputY, inputHeight, ...geometry.current});
        if (y !== null) {
          scroll.scrollTo({y, animated: false});
        }
      },
      () => {},
    );
  }, []);

  const scheduleReveal = useCallback(() => {
    if (pendingFrame.current === null) {
      pendingFrame.current = requestAnimationFrame(reveal);
    }
  }, [reveal]);

  useEffect(
    () => () => {
      if (pendingFrame.current !== null) {
        cancelAnimationFrame(pendingFrame.current);
      }
    },
    [],
  );

  const setRef = useCallback(
    (instance: BottomSheetScrollViewMethods | null) => {
      scrollRef.current = instance as ScrollViewInstance | null;
      if (typeof ref === 'function') {
        ref(instance);
      } else if (ref) {
        ref.current = instance;
      }
    },
    [ref],
  );

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      geometry.current.offsetY = event.nativeEvent.contentOffset.y;
      onScroll?.(event);
    },
    [onScroll],
  );

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const {height} = event.nativeEvent.layout;
      const shrank = height < geometry.current.viewportHeight;
      geometry.current.viewportHeight = height;
      if (shrank) {
        scheduleReveal();
      }
      onLayout?.(event);
    },
    [onLayout, scheduleReveal],
  );

  const handleContentSizeChange = useCallback(
    (width: number, height: number) => {
      geometry.current.contentHeight = height;
      scheduleReveal();
      onContentSizeChange?.(width, height);
    },
    [onContentSizeChange, scheduleReveal],
  );

  return (
    <BottomSheetScrollView
      {...props}
      ref={setRef}
      onScroll={handleScroll}
      onLayout={handleLayout}
      onContentSizeChange={handleContentSizeChange}>
      {children}
    </BottomSheetScrollView>
  );
});

SheetScrollViewComponent.displayName = 'SheetScrollView';

export const SheetScrollView = memo(SheetScrollViewComponent);
