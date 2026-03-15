import React, {useEffect, useState, useContext} from 'react';
import {View, TextInput as RNTextInput} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import {
  NativeViewGestureHandler,
  ScrollView,
} from 'react-native-gesture-handler';

import {Text, Switch, Chip, Button as PaperButton} from 'react-native-paper';

import {Divider, TextInput} from '../../../components';

import {useTheme} from '../../../hooks';

import {createStyles} from './styles';
import {ChatTemplatePicker} from '../ChatTemplatePicker';

import {ChatTemplateConfig} from '../../../utils/types';
import {L10nContext} from '../../../utils';
import {CompletionParams} from '../../../utils/completionTypes';
import {
  chatTemplateInterpreterOptions,
  chatTemplates,
  getChatTemplateDisplayName,
  getChatTemplateInterpreterDisplayName,
  getEffectiveChatTemplateInterpreter,
} from '../../../utils/chat';

interface ModelSettingsProps {
  modelName: string;
  chatTemplate: ChatTemplateConfig;
  defaultTemplateText?: string;
  runtimeTemplateText?: string;
  stopWords: CompletionParams['stop'];
  onChange: (name: string, value: any) => void;
  onStopWordsChange: (stopWords: CompletionParams['stop']) => void;
  onModelNameChange: (name: string) => void;
  onTemplateScrollLockChange?: (locked: boolean) => void;
}

export const ModelSettings: React.FC<ModelSettingsProps> = ({
  modelName,
  chatTemplate,
  defaultTemplateText,
  runtimeTemplateText,
  stopWords,
  onChange,
  onStopWordsChange,
  onModelNameChange,
  onTemplateScrollLockChange,
}) => {
  const l10n = useContext(L10nContext);
  const [localChatTemplate, setLocalChatTemplate] = useState(
    chatTemplate.chatTemplate,
  );
  const [newStopWord, setNewStopWord] = useState('');

  const [selectedTemplateName, setSelectedTemplateName] = useState(
    chatTemplate.name,
  );
  const [selectedTemplateInterpreter, setSelectedTemplateInterpreter] =
    useState(getEffectiveChatTemplateInterpreter(chatTemplate));

  const theme = useTheme();
  const styles = createStyles(theme);

  useEffect(() => {
    setLocalChatTemplate(chatTemplate.chatTemplate);
    setSelectedTemplateName(chatTemplate.name);
    setSelectedTemplateInterpreter(getEffectiveChatTemplateInterpreter(chatTemplate));
  }, [chatTemplate]);

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

  const handleChatTemplateNameChange = (chatTemplateName: string) => {
    setSelectedTemplateName(chatTemplateName);
    onChange('name', chatTemplateName);
    const nextTemplate = chatTemplates[chatTemplateName];
    if (nextTemplate) {
      setLocalChatTemplate(nextTemplate.chatTemplate);
      onChange('chatTemplate', nextTemplate.chatTemplate);
      setSelectedTemplateInterpreter(
        getEffectiveChatTemplateInterpreter(nextTemplate),
      );
      onChange(
        'templateInterpreter',
        getEffectiveChatTemplateInterpreter(nextTemplate),
      );
    }
  };

  const handleTemplateInterpreterChange = (interpreter: string) => {
    setSelectedTemplateInterpreter(interpreter as 'nunjucks' | 'jinja');
    onChange('templateInterpreter', interpreter);
  };

  const setTemplateScrollLock = (locked: boolean) => {
    onTemplateScrollLockChange?.(locked);
  };

  const handlePreviewTouchStart = () => {
    setTemplateScrollLock(true);
  };

  const handlePreviewTouchEnd = () => {
    setTemplateScrollLock(false);
  };

  const interpreterItems = chatTemplateInterpreterOptions.map(value => ({
    label: getChatTemplateInterpreterDisplayName(value),
    value,
  }));
  const isTemplateInterpreterLocked = selectedTemplateName !== 'custom';
  const effectiveTemplateInterpreter = isTemplateInterpreterLocked
    ? 'nunjucks'
    : selectedTemplateInterpreter;

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
      <Text style={styles.sectionHeader} variant="titleMedium">
        {l10n.models.modelSettings.template.sectionTitle}
      </Text>
      <ChatTemplatePicker
        selectedTemplateName={selectedTemplateName}
        handleChatTemplateNameChange={handleChatTemplateNameChange}
      />
      <ChatTemplatePicker
        label={l10n.models.modelSettings.template.interpreterLabel}
        selectedTemplateName={effectiveTemplateInterpreter}
        handleChatTemplateNameChange={handleTemplateInterpreterChange}
        items={interpreterItems}
        disabled={isTemplateInterpreterLocked}
        inputTestID="interpreter_picker_input"
      />
      <Text variant="labelSmall" style={styles.templateMeta}>
        {`${l10n.models.modelSettings.template.selectedLabel} ${getChatTemplateDisplayName(selectedTemplateName || chatTemplate.name)}`}
      </Text>
      <Text variant="labelSmall" style={styles.templateMeta}>
        {isTemplateInterpreterLocked
          ? l10n.models.modelSettings.template.interpreterLockedNote
          : l10n.models.modelSettings.template.interpreterCustomNote}
      </Text>
      <Text variant="labelSmall" style={styles.templateMeta}>
        {l10n.models.modelSettings.template.autoMatchNote}
      </Text>
      <Text variant="labelSmall" style={styles.templateMeta}>
        {l10n.models.modelSettings.template.thinkingNote}
      </Text>
      <View style={styles.templateEditor}>
        <RNTextInput
          value={localChatTemplate}
          placeholder={l10n.models.modelSettings.template.placeholder}
          placeholderTextColor={theme.colors.placeholder}
          onChangeText={text => {
            setLocalChatTemplate(text);
            onChange('chatTemplate', text);
          }}
          multiline
          scrollEnabled
          textAlignVertical="top"
          onFocus={() => setTemplateScrollLock(true)}
          onBlur={() => setTemplateScrollLock(false)}
          style={styles.templateEditorInput}
          testID="template-editor-input"
        />
      </View>
      {!(localChatTemplate || '').trim() && (
        <>
          <Text variant="labelSmall" style={styles.templateMeta}>
            {runtimeTemplateText?.trim()
              ? l10n.models.modelSettings.template.effectiveSourceGguf
              : defaultTemplateText?.trim()
                ? l10n.models.modelSettings.template.effectiveSourceModelDefault
                : l10n.models.modelSettings.template.effectiveSourceRuntimeAuto}
          </Text>
          <View
            style={styles.effectiveTemplatePreviewInput}
            onTouchStart={handlePreviewTouchStart}
            onTouchEnd={handlePreviewTouchEnd}
            onTouchCancel={handlePreviewTouchEnd}
            testID="effective-template-preview">
            <PaperButton
              mode="text"
              compact
              style={styles.previewCopyButton}
              onPress={() => {
                const textToCopy =
                  (runtimeTemplateText || '').trim() ||
                  (defaultTemplateText || '').trim() ||
                  l10n.models.modelSettings.template
                    .builtInTemplateAvailableAfterLoad;
                Clipboard.setString(textToCopy);
              }}
              accessibilityLabel={l10n.components.chatView.menuItems.copy}
              testID="effective-template-copy-button"
              contentStyle={styles.previewCopyButtonContent}
              labelStyle={styles.previewCopyButtonLabel}>
              {l10n.components.chatView.menuItems.copy}
            </PaperButton>
            <NativeViewGestureHandler
              disallowInterruption
              shouldActivateOnStart>
              <ScrollView
                style={styles.previewScrollView}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                onTouchStart={handlePreviewTouchStart}
                onTouchEnd={handlePreviewTouchEnd}
                onTouchCancel={handlePreviewTouchEnd}
                onScrollBeginDrag={() => setTemplateScrollLock(true)}
                onScrollEndDrag={() => setTemplateScrollLock(false)}
                onMomentumScrollEnd={() => setTemplateScrollLock(false)}
                contentContainerStyle={styles.previewScrollContent}>
                <Text style={styles.effectiveTemplatePreviewText}>
                  {(runtimeTemplateText || '').trim() ||
                    (defaultTemplateText || '').trim() ||
                    l10n.models.modelSettings.template
                      .builtInTemplateAvailableAfterLoad}
                </Text>
              </ScrollView>
            </NativeViewGestureHandler>
          </View>
        </>
      )}
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
        />
      </View>

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
      </View>

      <Divider style={styles.divider} />
      {renderStopWords()}
      <Divider style={styles.divider} />
      {renderTemplateSection()}
    </View>
  );
};
