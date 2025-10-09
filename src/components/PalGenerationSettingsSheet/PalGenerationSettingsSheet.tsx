import React, {useContext, useEffect, useState} from 'react';
import {Sheet} from '../Sheet/Sheet';
import {CompletionSettings} from '../CompletionSettings';
import {CompletionParams} from '../../utils/completionTypes';
import {chatSessionStore, defaultCompletionSettings} from '../../store';
import {
  COMPLETION_PARAMS_METADATA,
  validateCompletionSettings,
} from '../../utils/modelSettings';
import {Alert, View} from 'react-native';
import {Button, Text, Icon} from 'react-native-paper';
import {L10nContext} from '../../utils';
import {ChevronDownIcon} from '../../assets/icons';
import {Menu} from '../Menu';

import {useTheme} from '../../hooks';
import {createStyles} from './styles';

interface ResetButtonProps {
  resetMenuVisible: boolean;
  setResetMenuVisible: (visible: boolean) => void;
  handleResetToDefault: () => void;
  handleResetToGlobal: () => void;
  handleResetToSystem: () => void;
  styles: ReturnType<typeof createStyles>;
}

const ChevronDownButtonIcon = ({color}: {color: string}) => (
  <ChevronDownIcon width={16} height={16} stroke={color} />
);

// Reset button component for pal settings
const ResetButton = ({
  resetMenuVisible,
  setResetMenuVisible,
  handleResetToDefault,
  handleResetToGlobal,
  handleResetToSystem,
  styles,
}: ResetButtonProps) => {
  const l10n = useContext(L10nContext);

  return (
    <Menu
      visible={resetMenuVisible}
      onDismiss={() => setResetMenuVisible(false)}
      anchor={
        <View style={styles.resetWrapper}>
          <Button
            mode="text"
            onPress={() => setResetMenuVisible(true)}
            style={styles.resetButton}
            contentStyle={styles.resetButtonContent}
            icon={ChevronDownButtonIcon}>
            {l10n.common.reset}
          </Button>
        </View>
      }>
      <Menu.Item
        onPress={handleResetToGlobal}
        label={l10n.components.palGenerationSettingsSheet.resetToGlobal}
      />
      <Menu.Item
        onPress={handleResetToSystem}
        label={l10n.components.palGenerationSettingsSheet.resetToSystem}
      />
      <Menu.Item
        onPress={handleResetToDefault}
        label={l10n.components.palGenerationSettingsSheet.clearPalSettings}
      />
    </Menu>
  );
};

interface SettingsLevelIndicatorProps {
  palName: string;
  hasCustomSettings: boolean;
}

const SettingsLevelIndicator = ({
  palName,
  hasCustomSettings,
}: SettingsLevelIndicatorProps) => {
  const l10n = useContext(L10nContext);
  const theme = useTheme();
  const styles = createStyles(theme);

  return (
    <View style={styles.settingsLevelIndicator}>
      <Icon
        source={hasCustomSettings ? 'account-cog' : 'cog'}
        size={16}
        color={styles.settingsLevelIcon.color}
      />
      <Text variant="bodySmall" style={styles.settingsLevelText}>
        {hasCustomSettings
          ? l10n.components.palGenerationSettingsSheet.customSettingsFor(
              palName,
            )
          : l10n.components.palGenerationSettingsSheet.inheritedSettingsFor(
              palName,
            )}
      </Text>
    </View>
  );
};

export const PalGenerationSettingsSheet = ({
  isVisible,
  onClose,
  palName,
  completionSettings,
  onUpdateSettings,
}: {
  isVisible: boolean;
  onClose: () => void;
  palName: string;
  completionSettings?: Record<string, any>;
  onUpdateSettings: (settings: Record<string, any> | undefined) => void;
}) => {
  const l10n = useContext(L10nContext);
  const theme = useTheme();
  const styles = createStyles(theme);

  const [settings, setSettings] = useState<CompletionParams>(
    (completionSettings as CompletionParams) || defaultCompletionSettings,
  );
  const [resetMenuVisible, setResetMenuVisible] = useState(false);

  // Update settings when completionSettings changes
  useEffect(() => {
    setSettings(
      (completionSettings as CompletionParams) || defaultCompletionSettings,
    );
  }, [completionSettings]);

  const updateSettings = (name: string, value: any) => {
    setSettings(prev => ({...prev, [name]: value}));
  };

  const onCloseSheet = () => {
    // Reset to original settings
    setSettings(
      (completionSettings as CompletionParams) || defaultCompletionSettings,
    );
    onClose();
  };

  const handleSaveSettings = async () => {
    // Convert string values to numbers where needed
    const processedSettings = Object.entries(settings).reduce(
      (acc, [key, value]) => {
        const metadata = COMPLETION_PARAMS_METADATA[key];
        if (metadata?.validation.type === 'numeric') {
          let numValue: number;
          if (typeof value === 'string') {
            numValue = Number(value);
          } else if (typeof value === 'number') {
            numValue = value;
          } else {
            acc.errors[key] =
              l10n.components.palGenerationSettingsSheet.invalidNumericValuesMessage;
            return acc;
          }

          if (Number.isNaN(numValue)) {
            acc.errors[key] =
              l10n.components.palGenerationSettingsSheet.invalidNumericValuesMessage;
          } else {
            acc.settings[key] = numValue;
          }
        } else {
          acc.settings[key] = value;
        }
        return acc;
      },
      {settings: {}, errors: {}} as {
        settings: typeof settings;
        errors: Record<string, string>;
      },
    );

    // Validate the converted values
    const validationResult = validateCompletionSettings(
      processedSettings.settings,
    );
    const allErrors = {
      ...processedSettings.errors,
      ...validationResult.errors,
    };

    if (Object.keys(allErrors).length > 0) {
      Alert.alert(
        l10n.components.palGenerationSettingsSheet.invalidValues,
        l10n.components.palGenerationSettingsSheet.pleaseCorrect +
          '\n' +
          Object.entries(allErrors)
            .map(([key, msg]) => `• ${key}: ${msg}`)
            .join('\n'),
        [{text: l10n.components.palGenerationSettingsSheet.ok}],
      );
      return;
    }

    // Update the completion settings
    onUpdateSettings(processedSettings.settings);
    onClose();
  };

  const handleResetToGlobal = async () => {
    const globalSettings = await chatSessionStore.resolveCompletionSettings();
    setSettings(globalSettings);
    setResetMenuVisible(false);
  };

  const handleResetToSystem = () => {
    setSettings({...defaultCompletionSettings});
    setResetMenuVisible(false);
  };

  const handleResetToDefault = () => {
    // Clear pal-specific settings (use system defaults)
    onUpdateSettings(undefined);
    setSettings(defaultCompletionSettings);
    setResetMenuVisible(false);
  };

  const hasCustomSettings = completionSettings !== undefined;

  return (
    <Sheet
      title={l10n.components.palGenerationSettingsSheet.title(palName)}
      isVisible={isVisible}
      onClose={onCloseSheet}>
      <Sheet.ScrollView
        bottomOffset={16}
        contentContainerStyle={styles.scrollviewContainer}>
        <SettingsLevelIndicator
          palName={palName}
          hasCustomSettings={hasCustomSettings}
        />
        <CompletionSettings settings={settings} onChange={updateSettings} />
      </Sheet.ScrollView>
      <Sheet.Actions>
        <View style={styles.actionsContainer}>
          <ResetButton
            resetMenuVisible={resetMenuVisible}
            setResetMenuVisible={setResetMenuVisible}
            handleResetToDefault={handleResetToDefault}
            handleResetToGlobal={handleResetToGlobal}
            handleResetToSystem={handleResetToSystem}
            styles={styles}
          />
          <View style={styles.rightButtons}>
            <Button mode="contained" onPress={handleSaveSettings}>
              {l10n.common.save}
            </Button>
          </View>
        </View>
      </Sheet.Actions>
    </Sheet>
  );
};
