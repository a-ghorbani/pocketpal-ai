import React, {useContext} from 'react';
import {View} from 'react-native';

import {Text} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import {useTheme} from '../../hooks';

import {styles} from './styles';

import {L10nContext} from '../../utils';
import {t} from '../../locales';

interface ToolUsedChipProps {
  toolName: string;
}

/**
 * Subtle, low-prominence "used X" chip rendered for tool calls that
 * have no registered TalentUI (e.g. datetime, calculate). Per WHAT
 * I3 / D8, this gives the user feedback that *something* happened
 * without dominating the chat layout. Intentionally minimal — no
 * card, no border; only a small wrench icon and onSurfaceVariant
 * text on a single line.
 *
 * Renders nothing if `toolName` is empty.
 */
export const ToolUsedChip: React.FC<ToolUsedChipProps> = ({toolName}) => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);

  if (!toolName) {
    return null;
  }

  const componentStyles = styles({theme});

  return (
    <View style={componentStyles.container} testID="tool-used-chip">
      <Icon
        name="wrench-outline"
        style={componentStyles.icon}
        testID="tool-used-chip-icon"
      />
      <Text style={componentStyles.label}>
        {t(l10n.chat.toolUsedChip, {name: toolName})}
      </Text>
    </View>
  );
};
