import React, {useEffect, useRef, useState} from 'react';
import {TextInput as RNTextInput, ScrollView} from 'react-native';
import {View, Keyboard, TouchableWithoutFeedback} from 'react-native';

import {CompletionParams} from '@pocketpalai/llama.rn';
import {Button, Text, Switch} from 'react-native-paper';
import LinearGradient from 'react-native-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';

import {Dialog, Divider, TextInput} from '../../../components';

import {useTheme} from '../../../hooks';

import {createStyles} from './styles';
import {ChatTemplatePicker} from '../ChatTemplatePicker';
import {CompletionSettings} from '../CompletionSettings';

import {ChatTemplateConfig} from '../../../utils/types';

interface ModelSettingsProps {
  chatTemplate: ChatTemplateConfig;
  completionSettings: CompletionParams;
  onChange: (name: string, value: any) => void;
  onCompletionSettingsChange: (name: string, value: any) => void;
  onFocus?: () => void;
}

export const ModelSettings: React.FC<ModelSettingsProps> = ({
  chatTemplate,
  completionSettings,
  onChange,
  onCompletionSettingsChange,
  onFocus,
}) => {
  const [isDialogVisible, setDialogVisible] = useState<boolean>(false);
  const [localChatTemplate, setLocalChatTemplate] = useState(
    chatTemplate.chatTemplate,
  );

  const [selectedTemplateName, setSelectedTemplateName] = useState(
    chatTemplate.name,
  );

  const theme = useTheme();
  const styles = createStyles(theme);

  const textInputRef = useRef<RNTextInput>(null);

  useEffect(() => {
    setLocalChatTemplate(chatTemplate.chatTemplate);
    setSelectedTemplateName(chatTemplate.name);
  }, [chatTemplate]);

  useEffect(() => {
    if (textInputRef.current) {
      textInputRef.current.setNativeProps({text: localChatTemplate});
    }
  }, [localChatTemplate, isDialogVisible]);

  useEffect(() => {
    if (selectedTemplateName !== chatTemplate.name) {
      if (
        chatTemplate.chatTemplate !== undefined &&
        chatTemplate.chatTemplate !== null
      ) {
        setLocalChatTemplate(chatTemplate.chatTemplate);
      }
    }
  }, [chatTemplate.name, selectedTemplateName, chatTemplate.chatTemplate]);

  const handleSave = () => {
    onChange('chatTemplate', localChatTemplate);
    setDialogVisible(false);
  };

  const handleChatTemplateNameChange = (chatTemplateName: string) => {
    setSelectedTemplateName(chatTemplateName);
    onChange('name', chatTemplateName);
  };

  const dismissKeyboard = () => {
    Keyboard.dismiss();
  };

  const renderTokenSetting = (
    testID: string,
    label: string,
    isEnabled: boolean,
    token: string | undefined,
    toggleName: string,
    tokenName?: string,
  ) => (
    <View>
      <View style={styles.switchContainer}>
        <Text>{label}</Text>
        <Switch
          testID={`${testID}-switch`}
          value={isEnabled}
          onValueChange={value => onChange(toggleName, value)}
        />
      </View>
      {isEnabled && tokenName && (
        <TextInput
          placeholder={`${label} Token`}
          value={token}
          onChangeText={text => onChange(tokenName, text)}
          testID={`${testID}-input`}
        />
      )}
    </View>
  );

  const renderTemplateSection = () => (
    <View style={styles.settingsSection}>
      <View style={styles.chatTemplateRow}>
        <Text style={styles.chatTemplateLabel} variant="labelLarge">
          Template:
        </Text>
        <MaskedView
          style={styles.chatTemplateContainer}
          maskElement={
            <View style={styles.chatTemplateMaskContainer}>
              <Text variant="labelSmall">
                {chatTemplate.chatTemplate.trim().slice(0, 30)}
              </Text>
            </View>
          }>
          <LinearGradient
            colors={[theme.colors.onSurface, 'transparent']}
            style={styles.chatTemplatePreviewGradient}
            start={{x: 0.7, y: 0}}
            end={{x: 1, y: 0}}
          />
        </MaskedView>
        <Button
          onPress={() => {
            setLocalChatTemplate(chatTemplate.chatTemplate);
            setDialogVisible(true);
          }}>
          Edit
        </Button>
      </View>
    </View>
  );

  return (
    <TouchableWithoutFeedback onPress={dismissKeyboard}>
      <View style={styles.container} testID="settings-container">
        {/* Token Settings Section */}
        <View style={styles.settingsSection}>
          {renderTokenSetting(
            'BOS',
            'BOS',
            chatTemplate.addBosToken ?? false,
            chatTemplate.bosToken,
            'addBosToken',
            'bosToken',
          )}

          <Divider style={styles.divider} />

          {renderTokenSetting(
            'EOS',
            'EOS',
            chatTemplate.addEosToken ?? false,
            chatTemplate.eosToken,
            'addEosToken',
            'eosToken',
          )}

          <Divider style={styles.divider} />

          {renderTokenSetting(
            'add-generation-prompt',
            'Add Generation Prompt',
            chatTemplate.addGenerationPrompt ?? false,
            undefined,
            'addGenerationPrompt',
          )}

          <Divider style={styles.divider} />

          {/* System Prompt Section */}
          <View style={styles.settingsSection}>
            <TextInput
              testID="system-prompt-input"
              defaultValue={chatTemplate.systemPrompt ?? ''}
              onChangeText={text => {
                onChange('systemPrompt', text);
              }}
              multiline
              numberOfLines={3}
              style={styles.textArea}
              label={'System Prompt'}
              onFocus={() => {
                onFocus && onFocus();
              }}
            />
          </View>

          <Divider style={styles.divider} />

          {renderTemplateSection()}
        </View>

        <Divider style={styles.divider} />

        {/* Completion Settings Section */}
        <View style={styles.completionSettingsContainer}>
          <CompletionSettings
            settings={completionSettings}
            onChange={onCompletionSettingsChange}
          />
        </View>

        {/** Chat Template Dialog */}
        <Dialog
          visible={isDialogVisible}
          onDismiss={() => setDialogVisible(false)}
          title="Edit Chat Template"
          actions={[
            {
              label: 'Close',
              onPress: handleSave,
              mode: 'contained',
            },
          ]}>
          <View>
            <ChatTemplatePicker
              selectedTemplateName={selectedTemplateName}
              handleChatTemplateNameChange={handleChatTemplateNameChange}
            />
            <Text variant="labelSmall" style={styles.templateNote}>
              Note: Changing the template may alter BOS, EOS, and system prompt.
            </Text>
            <Text variant="labelSmall" style={styles.templateNote}>
              Uses Nunjucks. Leave empty to use model's template.
            </Text>
          </View>
          <ScrollView style={styles.scrollView}>
            <TextInput
              ref={textInputRef}
              placeholder="Enter your chat template here..."
              defaultValue={localChatTemplate}
              onChangeText={text => setLocalChatTemplate(text)}
              multiline
              numberOfLines={10}
              style={styles.textArea}
            />
          </ScrollView>
        </Dialog>
      </View>
    </TouchableWithoutFeedback>
  );
};
