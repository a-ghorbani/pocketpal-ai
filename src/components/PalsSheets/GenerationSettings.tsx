import React, {useContext, useEffect, useState} from 'react';
import {View} from 'react-native';

import {Button, Icon, Text} from 'react-native-paper';

import {Menu} from '../Menu';
import {CompletionSettings} from '../CompletionSettings';
import {ChevronDownIcon} from '../../assets/icons';

import {useTheme} from '../../hooks';
import {createStyles} from './styles';

import {chatSessionStore, defaultCompletionSettings} from '../../store';
import {CompletionParams} from '../../utils/completionTypes';
import {COMPLETION_PARAMS_METADATA} from '../../utils/modelSettings';

import {L10nContext} from '../../utils';
import {t} from '../../locales';

// Coerce numeric metadata fields to numbers so the form field persists the
// same value shape the standalone sheet wrote on Save. Non-numeric values
// and unparseable input pass through unchanged.
const coerceSettings = (next: Record<string, any>): Record<string, any> => {
  return Object.entries(next).reduce(
    (acc, [key, value]) => {
      const metadata = COMPLETION_PARAMS_METADATA[key];
      if (
        metadata?.validation.type === 'numeric' &&
        typeof value === 'string'
      ) {
        const numValue = Number(value);
        acc[key] = Number.isNaN(numValue) ? value : numValue;
      } else {
        acc[key] = value;
      }
      return acc;
    },
    {} as Record<string, any>,
  );
};

const ChevronDownButtonIcon = ({color}: {color: string}) => (
  <ChevronDownIcon width={16} height={16} stroke={color} />
);

interface GenerationSettingsProps {
  palName: string;
  /** Current pal-level completion settings (undefined = inherited). */
  completionSettings?: Record<string, any>;
  /** Single writer back into the form field (mirrors PalSheet state). */
  onUpdateSettings: (settings: Record<string, any> | undefined) => void;
}

/**
 * Generation-tab body of the pal form. Folds the former
 * PalGenerationSettingsSheet interior (level indicator + Reset menu +
 * completion params) into the tabbed form. Edits mirror straight into the
 * form's `completionSettings` field; persistence happens only when the
 * form footer Save runs PalStore.create/updatePal.
 */
export const GenerationSettings: React.FC<GenerationSettingsProps> = ({
  palName,
  completionSettings,
  onUpdateSettings,
}) => {
  const l10n = useContext(L10nContext);
  const theme = useTheme();
  const styles = createStyles(theme);

  const [settings, setSettings] = useState<CompletionParams>(
    (completionSettings as CompletionParams) || defaultCompletionSettings,
  );
  const [resetMenuVisible, setResetMenuVisible] = useState(false);

  useEffect(() => {
    setSettings(
      (completionSettings as CompletionParams) || defaultCompletionSettings,
    );
  }, [completionSettings]);

  const hasCustomSettings = completionSettings !== undefined;

  const updateSetting = (name: string, value: any) => {
    setSettings(prev => {
      const next = {...prev, [name]: value};
      onUpdateSettings(coerceSettings(next));
      return next;
    });
  };

  const handleResetToGlobal = async () => {
    const globalSettings = await chatSessionStore.resolveCompletionSettings();
    setSettings(globalSettings);
    onUpdateSettings(globalSettings);
    setResetMenuVisible(false);
  };

  const handleResetToSystem = () => {
    const systemSettings = {...defaultCompletionSettings};
    setSettings(systemSettings);
    onUpdateSettings(systemSettings);
    setResetMenuVisible(false);
  };

  const handleClearPalSettings = () => {
    onUpdateSettings(undefined);
    setSettings(defaultCompletionSettings);
    setResetMenuVisible(false);
  };

  return (
    <View>
      <View style={styles.settingsLevelIndicator}>
        <Icon
          source={hasCustomSettings ? 'account-cog' : 'cog'}
          size={16}
          color={styles.settingsLevelIcon.color}
        />
        <Text variant="bodySmall" style={styles.settingsLevelText}>
          {hasCustomSettings
            ? t(l10n.components.palGenerationSettingsSheet.customSettingsFor, {
                palName,
              })
            : t(
                l10n.components.palGenerationSettingsSheet.inheritedSettingsFor,
                {palName},
              )}
        </Text>
        <Menu
          visible={resetMenuVisible}
          onDismiss={() => setResetMenuVisible(false)}
          anchor={
            <Button
              mode="text"
              onPress={() => setResetMenuVisible(true)}
              icon={ChevronDownButtonIcon}
              testID="generation-reset-button">
              {l10n.common.reset}
            </Button>
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
            onPress={handleClearPalSettings}
            label={l10n.components.palGenerationSettingsSheet.clearPalSettings}
          />
        </Menu>
      </View>

      <CompletionSettings settings={settings} onChange={updateSetting} />
    </View>
  );
};
