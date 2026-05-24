import React from 'react';
import {Text, View} from 'react-native';

import {useTheme} from '../../../hooks';

import type {CommonDSProps} from '../types';

import {createStyles, type MessageContentVariant} from './styles';

export type MessageContentProps = Omit<CommonDSProps, 'disabled'> & {
  variant?: MessageContentVariant;
  size?: 'm';
  text?: string;
  children?: React.ReactNode;
};

/**
 * DS MessageContent — token-bound message bubble shell.
 *
 * Variants: user / assistant / system. Size axis is single ('m') —
 * message bubbles don't vary by size in Figma `128:3113`.
 *
 * The existing `src/components/Message/*` continues to render; this
 * is the additive DS variant for Phase 3 to wire.
 *
 * Defaults: variant='assistant', size='m', testID='ds-message-content',
 * accessibilityRole='none'.
 */
export const MessageContent: React.FC<MessageContentProps> = ({
  testID = 'ds-message-content',
  accessibilityRole = 'none',
  accessibilityLabel,
  style,
  variant = 'assistant',
  text,
  children,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme, variant);
  return (
    <View
      testID={testID}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      style={[styles.root, style]}>
      {text ? <Text style={styles.body}>{text}</Text> : null}
      {children}
    </View>
  );
};
