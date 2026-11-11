import React, {useContext, useRef} from 'react';
import {
  GestureResponderEvent,
  type HostInstance,
  TouchableOpacity,
} from 'react-native';

import {DotsHorizontalIcon} from '../../assets/icons';
import {useTheme} from '../../hooks';

import {styles} from './styles';

import {L10nContext} from '../../utils';
import {openAtPressPoint} from '../../utils/pressPoint';
import type {PressPointEvent} from '../../utils/types';

interface MessageMenuButtonProps {
  onPress?: (event: PressPointEvent) => void;
}

export const MessageMenuButton: React.FC<MessageMenuButtonProps> = ({
  onPress,
}) => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const button = useRef<HostInstance>(null);

  return (
    <TouchableOpacity
      ref={button}
      onPress={(event: GestureResponderEvent) =>
        onPress && openAtPressPoint(event, button.current, onPress)
      }
      testID="message-menu-button"
      accessibilityRole="button"
      accessibilityLabel={l10n.components.messageMenuButton.accessibilityLabel}
      style={styles.button}>
      <DotsHorizontalIcon
        width={16}
        height={16}
        fill={theme.colors.textSecondary}
      />
    </TouchableOpacity>
  );
};
