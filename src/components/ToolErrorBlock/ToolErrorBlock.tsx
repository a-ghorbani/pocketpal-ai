import React, {useContext} from 'react';
import {View} from 'react-native';

import {Text} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import {useTheme} from '../../hooks';

import {styles} from './styles';

import {L10nContext} from '../../utils';
import {t} from '../../locales';

interface ToolErrorBlockProps {
  toolName: string;
  errorMessage?: string;
}

/**
 * Inline error block for tool calls whose outcome is
 * `result.type === 'error'`. Falls back to "Tool call failed" copy when
 * no errorMessage is supplied. Renders nothing when `toolName` is empty.
 */
export const ToolErrorBlock: React.FC<ToolErrorBlockProps> = ({
  toolName,
  errorMessage,
}) => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);

  if (!toolName) {
    return null;
  }

  const componentStyles = styles({theme});

  return (
    <View style={componentStyles.container} testID="tool-error-block">
      <View style={componentStyles.row}>
        <Icon
          name="alert-outline"
          style={componentStyles.icon}
          testID="tool-error-block-icon"
        />
        <Text style={componentStyles.label}>
          {t(l10n.chat.toolErrorBlock, {name: toolName})}
        </Text>
      </View>
      {errorMessage ? (
        <Text style={componentStyles.message} testID="tool-error-block-message">
          {errorMessage}
        </Text>
      ) : null}
    </View>
  );
};
