import React, {useEffect, useRef, useState, useContext} from 'react';
import {TextInput as RNTextInput} from 'react-native';
import {View, Keyboard} from 'react-native';

import {Button, Text, Switch, Chip} from 'react-native-paper';
import LinearGradient from 'react-native-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';

import {Divider, TextInput} from '../../../components';

import {useTheme} from '../../../hooks';

import {createStyles} from './styles';
import {ChatTemplatePicker} from '../ChatTemplatePicker';

import {ChatTemplateConfig} from '../../../utils/types';
import {Sheet} from '../../../components/Sheet';
import {L10nContext} from '../../../utils';
import {CompletionParams} from '../../../utils/completionTypes';

interface ModelSettingsProps {
  modelName: string;
  chatTemplate: ChatTemplateConfig;
  stopWords: CompletionParams['stop'];
  isPresetModel: boolean;
  onChange: (name: string, value: any) => void;
  onStopWordsChange: (stopWords: CompletionParams['stop']) => void;
  onModelNameChange: (name: string) => void;
}

export const ModelSettings: React.FC<ModelSettingsProps> = ({
  modelName,
  chatTemplate,
  stopWords,
  isPresetModel,
  onChange,
  onStopWordsChange,
  onModelNameChange,
}) => {
  const l10n = useContext(L10nContext);
  const [isDialogVisible, setDialogVisible] = useState<boolean>(false);
  const [localChatTemplate, setLocalChatTemplate] = useState(
    chatTemplate.chatTemplate,
  );
  const [newStopWord, setNewStopWord] = useState('');

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
          {l10n.models.modelSettings.template.label}
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
          {l10n.models.modelSettings.template.editButton}
        </Button>
      </View>
    </View>
  );

  const renderStopWords = () => (
    <View style={styles.settingItem}>
      <View style={styles.stopLabel}>
        <Text variant="labelSmall" style={styles.settingLabel}>
          {l10n.models.modelSettings.stopWords.label}
        </Text>
      </View>

      {/* Display existing stop words as chips */}
      <View style={styles.stopWordsContainer}>
        {(stopWords ?? []).map((word, index) => (
          <Chip
            key={index}
            onClose={() => {
              const newStops = (stopWords ?? []).filter((_, i) => i !== index);
              onStopWordsChange(newStops);
            }}
            compact
            textStyle={styles.stopChipText}
            style={styles.stopChip}>
            {word}
          </Chip>
        ))}
      </View>

      {/* Input for new stop words */}
      <TextInput
        value={newStopWord}
        placeholder={l10n.models.modelSettings.stopWords.placeholder}
        onChangeText={setNewStopWord}
        onSubmitEditing={() => {
          if (newStopWord.trim()) {
            onStopWordsChange([...(stopWords ?? []), newStopWord.trim()]);
            setNewStopWord('');
          }
        }}
        testID="stop-input"
      />
    </View>
  );

  const onCloseSheet = () => {
    dismissKeyboard();
    setDialogVisible(false);
  };

  return (
    <View style={styles.container} testID="settings-container">
      {/* Model Name Section */}
      <View style={styles.settingsSection}>
        <Text style={styles.modelNameLabel}>
          {l10n.models.modelCard.labels.modelName}
        </Text>
        <TextInput
          value={modelName}
          onChangeText={text => onModelNameChange(text)}
          disabled={isPresetModel}
        />
      </View>

      <Divider style={styles.divider} />

      {/* Token Settings Section */}
      <View style={styles.settingsSection}>
        {renderTokenSetting(
          'BOS',
          l10n.models.modelSettings.tokenSettings.bos,
          chatTemplate.addBosToken ?? false,
          chatTemplate.bosToken,
          'addBosToken',
          'bosToken',
        )}

        <Divider style={styles.divider} />

        {renderTokenSetting(
          'EOS',
          l10n.models.modelSettings.tokenSettings.eos,
          chatTemplate.addEosToken ?? false,
          chatTemplate.eosToken,
          'addEosToken',
          'eosToken',
        )}

        <Divider style={styles.divider} />

        {renderTokenSetting(
          'add-generation-prompt',
          l10n.models.modelSettings.tokenSettings.addGenerationPrompt,
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
            label={l10n.models.modelSettings.tokenSettings.systemPrompt}
          />
        </View>

        <Divider style={styles.divider} />

        {renderTemplateSection()}
      </View>

      <Divider style={styles.divider} />
      {renderStopWords()}
      {/** Chat Template Dialog */}
      <Sheet
        isVisible={isDialogVisible}
        onClose={onCloseSheet}
        title={l10n.models.modelSettings.template.dialogTitle}
        enableContentPanningGesture={false}
        displayFullHeight>
        <Sheet.ScrollView
          bottomOffset={16}
          contentContainerStyle={styles.sheetContainer}>
          <View>
            <ChatTemplatePicker
              selectedTemplateName={selectedTemplateName}
              handleChatTemplateNameChange={handleChatTemplateNameChange}
            />
            <Text variant="labelSmall" style={styles.templateNote}>
              {l10n.models.modelSettings.template.note1}
            </Text>
            <Text variant="labelSmall" style={styles.templateNote}>
              {l10n.models.modelSettings.template.note2}
            </Text>
          </View>
          <TextInput
            ref={textInputRef}
            placeholder={l10n.models.modelSettings.template.placeholder}
            defaultValue={localChatTemplate}
            onChangeText={text => setLocalChatTemplate(text)}
            multiline
            numberOfLines={10}
            style={styles.textArea}
          />
        </Sheet.ScrollView>
        <Sheet.Actions style={styles.actionsContainer}>
          <Button
            testID="template-close-button"
            mode="contained"
            onPress={handleSave}>
            {l10n.models.modelSettings.template.closeButton}
          </Button>
        </Sheet.Actions>
      </Sheet>
    </View>
  );
};
