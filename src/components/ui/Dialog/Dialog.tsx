import React from 'react';
import {Pressable, View} from 'react-native';
import {Portal} from 'react-native-paper';

import {useTheme} from '../../../hooks';
import {Header} from '../Header';
import {Surface} from '../Surface';

import type {CommonDSProps} from '../types';

import {Actions, type ActionConfig} from '../Sheet/Actions';
import {createStyles} from './styles';

export type DialogProps = Omit<CommonDSProps, 'disabled'> & {
  isVisible?: boolean;
  onDismiss?: () => void;
  /**
   * Localized accessibility label for the scrim's dismiss Pressable.
   * Consumers pass an L10n string (e.g. l10n.common.dismiss). When
   * undefined, the Pressable is rendered without an accessibility
   * label rather than with a hard-coded English fallback.
   */
  dismissAccessibilityLabel?: string;
  title?: string;
  subtitle?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  align?: 'leading' | 'center';
  children?: React.ReactNode;
};

interface DialogComponent extends React.FC<DialogProps> {
  Actions: typeof Actions;
}

/**
 * DS Dialog — Portal + centered Surface + DS Header composition.
 * Renders a single Header; bespoke header markup is forbidden.
 *
 * Defaults: testID='ui-dialog'.
 */
const DialogBase: React.FC<DialogProps> = ({
  testID = 'ui-dialog',
  style,
  isVisible,
  onDismiss,
  dismissAccessibilityLabel,
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
      <View style={styles.centerWrapper}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={dismissAccessibilityLabel}
          onPress={onDismiss}
          style={styles.scrim}
        />
        <Surface
          testID={testID}
          radius="l"
          elevation={3}
          style={[styles.surface, style]}>
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
        </Surface>
      </View>
    </Portal>
  );
};

export const Dialog = DialogBase as DialogComponent;
Dialog.Actions = Actions;

export type {ActionConfig};
