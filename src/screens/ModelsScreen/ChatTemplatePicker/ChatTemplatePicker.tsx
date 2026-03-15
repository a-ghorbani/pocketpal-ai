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
  label?: string;
  selectedTemplateName: string | null;
  handleChatTemplateNameChange: (value: string) => void;
  items?: Array<{label: string; value: string}>;
  disabled?: boolean;
  inputTestID?: string;
}

const DropdownIcon = () => {
  const theme = useTheme();
  return (
    <Icon name="keyboard-arrow-down" size={24} color={theme.colors.onSurface} />
  );
};

export const ChatTemplatePicker: React.FC<TemplatePickerProps> = ({
  label,
  selectedTemplateName,
  handleChatTemplateNameChange,
  items,
  disabled = false,
  inputTestID = 'text_input',
}) => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);

  const pickerItems = useMemo(
    () =>
      items ||
      chatTemplateOptions.map(key => ({
        label: getChatTemplateDisplayName(key),
        value: key,
      })),
    [items],
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
          opacity: disabled ? 0.5 : 1,
        },
        inputAndroid: {
          height: pickerHeight,
          paddingVertical: 0,
          paddingHorizontal: 10,
          paddingRight: 30,
          color: theme.colors.onSurface,
          opacity: disabled ? 0.5 : 1,
        },
        placeholder: {
          color: theme.colors.secondary,
        },
        iconContainer: {
          justifyContent: 'center',
          alignItems: 'center',
          height: pickerHeight,
          opacity: disabled ? 0.5 : 1,
        },
      }),
    [disabled, theme.colors.onSurface, theme.colors.secondary],
  );

  return (
    <View style={styles.container}>
      <Text variant="labelMedium">
        {label || l10n.models.chatTemplate.label}
      </Text>
      <View style={styles.pickerContainer}>
        <RNPickerSelect
          onValueChange={handleChatTemplateNameChange}
          items={pickerItems}
          value={selectedTemplateName}
          placeholder={{}}
          style={pickerStyle}
          Icon={DropdownIcon}
          disabled={disabled}
          textInputProps={{testID: inputTestID}}
          useNativeAndroidPickerStyle={false} // Disabled native Android picker style
        />
      </View>
    </View>
  );
};
