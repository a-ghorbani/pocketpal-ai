import React, {useContext} from 'react';
import {GestureResponderEvent, TouchableOpacity} from 'react-native';

import {DotsHorizontalIcon} from '../../assets/icons';
import {useTheme} from '../../hooks';

import {styles} from './styles';

import {L10nContext} from '../../utils';

interface MessageMenuButtonProps {
  onPress?: (event: GestureResponderEvent) => void;
}

export const MessageMenuButton: React.FC<MessageMenuButtonProps> = ({
  onPress,
}) => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);

  return (
    <TouchableOpacity
      onPress={onPress}
      testID="message-menu-button"
      accessibilityRole="button"
      accessibilityLabel={l10n.components.messageMenuButton.accessibilityLabel}
      hitSlop={14}
      style={styles.button}>
      <DotsHorizontalIcon
        width={16}
        height={16}
        fill={theme.colors.textSecondary}
      />
    </TouchableOpacity>
  );
};
