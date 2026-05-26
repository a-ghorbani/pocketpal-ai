import React, {useEffect, useMemo, useRef} from 'react';
import {
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetModalProps,
} from '@gorhom/bottom-sheet';
import {View} from 'react-native';
import type {BottomSheetModalMethods} from '@gorhom/bottom-sheet/lib/typescript/types';

import {useTheme} from '../../../hooks';
import {Header} from '../Header';

import type {CommonDSProps} from '../types';

import {Actions, type ActionConfig} from './Actions';
import {createStyles} from './styles';

export type SheetProps = Omit<CommonDSProps, 'disabled'> & {
  isVisible?: boolean;
  onDismiss?: () => void;
  title?: string;
  subtitle?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  align?: 'leading' | 'center';
  snapPoints?: BottomSheetModalProps['snapPoints'];
  children?: React.ReactNode;
};

interface SheetComponent extends React.FC<SheetProps> {
  Actions: typeof Actions;
}

/**
 * DS Sheet — composition of @gorhom/bottom-sheet + DS Header + body +
 * Actions. Renders exactly one Header; bespoke header markup inside is
 * forbidden.
 *
 * Defaults: testID='ui-sheet'.
 */
const SheetBase: React.FC<SheetProps> = ({
  testID = 'ui-sheet',
  style,
  isVisible,
  onDismiss,
  title,
  subtitle,
  leading,
  trailing,
  align,
  snapPoints,
  children,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const ref = useRef<BottomSheetModalMethods>(null);
  const resolvedSnapPoints = useMemo(
    () => snapPoints ?? ['50%', '90%'],
    [snapPoints],
  );

  useEffect(() => {
    if (isVisible) {
      ref.current?.present();
    } else {
      ref.current?.dismiss();
    }
  }, [isVisible]);

  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={resolvedSnapPoints}
      onDismiss={onDismiss}
      backgroundStyle={{backgroundColor: theme.colors.surface}}
      handleIndicatorStyle={{backgroundColor: theme.colors.outlineVariant}}>
      <BottomSheetView testID={testID} style={[styles.container, style]}>
        {(title || subtitle || leading || trailing) && (
          <Header
            title={title}
            subtitle={subtitle}
            leading={leading}
            trailing={trailing}
            align={align}
          />
        )}
        <View style={styles.body}>{children}</View>
      </BottomSheetView>
    </BottomSheetModal>
  );
};

export const Sheet = SheetBase as SheetComponent;
Sheet.Actions = Actions;

export type {ActionConfig};
