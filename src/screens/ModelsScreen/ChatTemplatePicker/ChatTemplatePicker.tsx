import React, {useMemo, useContext} from 'react';
import {StyleSheet, View} from 'react-native';

import {Text} from 'react-native-paper';
import RNPickerSelect from 'react-native-picker-select';
import Icon from 'react-native-vector-icons/MaterialIcons';

import {useTheme} from '../../../hooks';
import {L10nContext} from '../../../utils';

import {styles} from './styles';

import {
  chatTemplateOptions,
  getChatTemplateDisplayName,
} from '../../../utils/chat';

const pickerHeight = 30;

interface TemplatePickerProps {
  selectedTemplateName: string | null;
  handleChatTemplateNameChange: (value: string) => void;
}

const DropdownIcon = () => {
  const theme = useTheme();
  return (
    <Icon name="keyboard-arrow-down" size={24} color={theme.colors.onSurface} />
  );
};

export const ChatTemplatePicker: React.FC<TemplatePickerProps> = ({
  selectedTemplateName,
  handleChatTemplateNameChange,
}) => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);

  const pickerItems = useMemo(
    () =>
      chatTemplateOptions.map(key => ({
        label: getChatTemplateDisplayName(key),
        value: key,
      })),
    [],
  );

  const pickerStyle = useMemo(
    () =>
      StyleSheet.create({
        inputIOS: {
          height: pickerHeight,
          paddingVertical: 0,
          paddingHorizontal: 10,
          paddingRight: 30,
          color: theme.colors.onSurface,
        },
        inputAndroid: {
          height: pickerHeight,
          paddingVertical: 0,
          paddingHorizontal: 10,
          paddingRight: 30,
          color: theme.colors.onSurface,
        },
        placeholder: {
          color: theme.colors.secondary,
        },
        iconContainer: {
          justifyContent: 'center',
          alignItems: 'center',
          height: pickerHeight,
        },
      }),
    [theme.colors.onSurface, theme.colors.secondary],
  );

  return (
    <View style={styles.container}>
      <Text variant="labelMedium">{l10n.models.chatTemplate.label}</Text>
      <View style={styles.pickerContainer}>
        <RNPickerSelect
          onValueChange={handleChatTemplateNameChange}
          items={pickerItems}
          value={selectedTemplateName}
          placeholder={{}}
          style={pickerStyle}
          Icon={DropdownIcon}
          useNativeAndroidPickerStyle={false} // Disabled native Android picker style
        />
      </View>
    </View>
  );
};
