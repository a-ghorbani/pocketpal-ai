import {
  BottomSheetModal,
  BottomSheetModalProps,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import React, {forwardRef, useEffect, useMemo, useRef} from 'react';
import {
  useSafeAreaFrame,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import {BottomSheetModalMethods} from '@gorhom/bottom-sheet/lib/typescript/types';
import {Text} from 'react-native-paper';
import {CloseIcon} from '../../assets/icons';
import {useTheme} from '../../hooks';
import {styles} from './styles';
import {TouchableOpacity, View} from 'react-native';
import {CustomBackdrop} from './CustomBackdrop';
import {Actions} from './Actions';
import {SheetBackground} from './SheetBackground';
import {SheetHandle} from './SheetHandle';
import {SheetScrollView} from './SheetScrollView';
import {SheetAwareNativeInput} from '../TextInput/SheetAwareNativeInput';
import {DismissKeyboardOnRotation} from './DismissKeyboardOnRotation';
import {fullHeightSnapPoint, resolveSnapPoints} from './snapPoints';

export interface SheetProps extends Partial<BottomSheetModalProps> {
  children?: React.ReactNode;
  title?: string;
  isVisible?: boolean;
  onClose?: () => void;
  displayFullHeight?: boolean;
  showCloseButton?: boolean;
}

interface SheetComponent
  extends React.ForwardRefExoticComponent<
    SheetProps & React.RefAttributes<BottomSheetModalMethods>
  > {
  ScrollView: typeof SheetScrollView;
  View: typeof BottomSheetView;
  Actions: typeof Actions;
  TextInput: typeof SheetAwareNativeInput;
}

export const Sheet = forwardRef(
  (
    {
      children,
      title,
      isVisible,
      displayFullHeight,
      onClose,
      showCloseButton = true,
      snapPoints: requestedSnapPoints,
      ...props
    }: SheetProps,
    ref: React.Ref<BottomSheetModalMethods>,
  ) => {
    const insets = useSafeAreaInsets();
    const innerRef = useRef<BottomSheetModalMethods>(null);

    const activeRef = useMemo(() => {
      if (ref && 'current' in ref && ref.current) {
        return ref;
      }
      return innerRef;
    }, [ref, innerRef]);

    const theme = useTheme();

    useEffect(() => {
      if (isVisible) {
        activeRef?.current?.present();
      } else {
        activeRef?.current?.close();
      }
    }, [isVisible, activeRef]);

    const onDismiss = () => {
      activeRef?.current?.close();
      onClose?.();
    };

    const {height: containerHeight} = useSafeAreaFrame();
    const snapPoints = useMemo(() => {
      if (displayFullHeight) {
        return [fullHeightSnapPoint(containerHeight, insets.top)];
      }
      return resolveSnapPoints(
        requestedSnapPoints,
        containerHeight,
        insets.top,
      );
    }, [displayFullHeight, containerHeight, insets.top, requestedSnapPoints]);

    return (
      <BottomSheetModal
        ref={activeRef}
        maxDynamicContentSize={fullHeightSnapPoint(containerHeight, insets.top)}
        topInset={insets.top}
        enableDynamicSizing={!snapPoints}
        stackBehavior="push"
        backdropComponent={CustomBackdrop}
        backgroundComponent={SheetBackground}
        handleComponent={SheetHandle}
        keyboardBlurBehavior="restore"
        activeOffsetY={[-1, 1]}
        failOffsetX={[-5, 5]}
        backgroundStyle={{
          backgroundColor: theme.colors.background,
        }}
        snapPoints={snapPoints}
        onDismiss={onDismiss}
        // Disable accessible to allow Appium/e2e tests to access child elements on iOS
        // See: https://github.com/gorhom/react-native-bottom-sheet/issues/1141
        accessible={false}
        {...props}>
        <DismissKeyboardOnRotation />
        <View style={styles.header}>
          {title && <Text variant="titleMedium">{title}</Text>}
          {showCloseButton && (
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onDismiss}
              hitSlop={10}
              testID="sheet-close-button"
              accessibilityLabel="Close"
              accessibilityRole="button">
              <CloseIcon stroke={theme.colors.primary} />
            </TouchableOpacity>
          )}
        </View>
        {children}
      </BottomSheetModal>
    );
  },
) as SheetComponent;

Sheet.displayName = 'Sheet';
Sheet.ScrollView = SheetScrollView;
Sheet.View = BottomSheetView;
Sheet.Actions = Actions;
Sheet.TextInput = SheetAwareNativeInput;
