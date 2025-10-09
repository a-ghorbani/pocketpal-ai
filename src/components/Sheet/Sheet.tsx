import {
  BottomSheetModal,
  BottomSheetModalProps,
  BottomSheetTextInput,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import React, {forwardRef, useEffect, useMemo, useRef} from 'react';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {BottomSheetModalMethods} from '@gorhom/bottom-sheet/lib/typescript/types';
import {Text} from 'react-native-paper';
import {CloseIcon} from '../../assets/icons';
import {useTheme} from '../../hooks';
import {styles} from './styles';
import BottomSheetKeyboardAwareScrollView from './BottomSheetAwareScrollview';
import {Dimensions, TouchableOpacity, View} from 'react-native';
import {CustomBackdrop} from './CustomBackdrop';
import {Actions} from './Actions';

export interface SheetProps extends Partial<BottomSheetModalProps> {
  children?: React.ReactNode;
  title?: string;
  isVisible?: boolean;
  onClose?: () => void;
  displayFullHeight?: boolean;
}

interface SheetComponent
  extends React.ForwardRefExoticComponent<
    SheetProps & React.RefAttributes<BottomSheetModalMethods>
  > {
  ScrollView: typeof BottomSheetKeyboardAwareScrollView;
  View: typeof BottomSheetView;
  Actions: typeof Actions;
  TextInput: typeof BottomSheetTextInput;
}

export const Sheet = forwardRef(
  (
    {
      children,
      title,
      isVisible,
      displayFullHeight,
      onClose,
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

    const snapPoints = useMemo(() => {
      if (displayFullHeight) {
        return [Dimensions.get('screen').height - insets.top - 16];
      }
      return props.snapPoints;
    }, [displayFullHeight, insets, props.snapPoints]);

    return (
      <BottomSheetModal
        ref={activeRef}
        maxDynamicContentSize={
          Dimensions.get('screen').height - insets.top - 16
        }
        enableDynamicSizing={!snapPoints}
        stackBehavior="push"
        backdropComponent={CustomBackdrop}
        keyboardBlurBehavior="restore"
        activeOffsetY={[-1, 1]}
        failOffsetX={[-5, 5]}
        backgroundStyle={{
          backgroundColor: theme.colors.background,
        }}
        handleIndicatorStyle={{
          backgroundColor: theme.colors.primary,
        }}
        snapPoints={snapPoints}
        onDismiss={onDismiss}
        {...props}>
        <View style={styles.header}>
          {title && <Text variant="titleMedium">{title}</Text>}
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onDismiss}
            hitSlop={10}>
            <CloseIcon stroke={theme.colors.primary} />
          </TouchableOpacity>
        </View>
        {children}
      </BottomSheetModal>
    );
  },
) as SheetComponent;

Sheet.displayName = 'Sheet';
Sheet.ScrollView = BottomSheetKeyboardAwareScrollView;
Sheet.View = BottomSheetView;
Sheet.Actions = Actions;
Sheet.TextInput = BottomSheetTextInput;
