import React, {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';

import {Text} from 'react-native-paper';
import RNPickerSelect from 'react-native-picker-select';
import Icon from 'react-native-vector-icons/MaterialIcons';

import {useTheme} from '../../../hooks';

import {styles} from './styles';

import {chatTemplates} from '../../../utils/chat';

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

  const pickerItems = useMemo(
    () =>
      Object.entries(chatTemplates).map(([key, template]) => ({
        label: template.name,
        value: key,
      })),
    [],
  );

  const pickerStyle = useMemo(
    () =>
      StyleSheet.create({
        inputIOS: {
          flex: 1,
          paddingVertical: 10,
          paddingHorizontal: 10,
          paddingRight: 30,
          color: theme.colors.onSurface,
        },
        inputAndroid: {
          flex: 1,
          height: 40,
          paddingHorizontal: 10,
          paddingVertical: 8,
          paddingRight: 30,
          color: theme.colors.onSurface,
        },
        placeholder: {
          color: theme.colors.secondary,
        },
        iconContainer: {
          justifyContent: 'center',
          alignItems: 'center',
        },
      }),
    [theme.colors.onSurface, theme.colors.secondary],
  );

  return (
    <View style={styles.container}>
      <Text variant="labelMedium">Base Chat Template:</Text>
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
