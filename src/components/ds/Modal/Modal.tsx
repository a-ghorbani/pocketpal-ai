import React from 'react';
import {Pressable, View} from 'react-native';
import {Portal} from 'react-native-paper';

import {useTheme} from '../../../hooks';
import {Header} from '../Header';

import type {CommonDSProps} from '../types';

import {Actions, type ActionConfig} from '../Sheet/Actions';
import {createStyles} from './styles';

export type ModalProps = Omit<CommonDSProps, 'disabled'> & {
  isVisible?: boolean;
  onDismiss?: () => void;
  title?: string;
  subtitle?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  align?: 'leading' | 'center';
  children?: React.ReactNode;
};

interface ModalComponent extends React.FC<ModalProps> {
  Actions: typeof Actions;
}

/**
 * DS Modal — Portal + full-screen View + DS Header composition.
 * Renders a single Header; bespoke header markup is forbidden.
 *
 * Defaults: testID='ds-modal'.
 */
const ModalBase: React.FC<ModalProps> = ({
  testID = 'ds-modal',
  style,
  isVisible,
  onDismiss,
  title,
  subtitle,
  leading,
  trailing,
  align,
  children,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  if (!isVisible) {
    return null;
  }
  return (
    <Portal>
      <View testID={testID} style={[styles.surface, style]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={onDismiss}
          style={styles.scrim}
        />
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
      </View>
    </Portal>
  );
};

export const Modal = ModalBase as ModalComponent;
Modal.Actions = Actions;

export type {ActionConfig};
