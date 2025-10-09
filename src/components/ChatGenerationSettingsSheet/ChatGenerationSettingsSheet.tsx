import React, {useContext, useEffect, useState} from 'react';
import {Sheet} from '../Sheet/Sheet';
import {CompletionSettings} from '..';
import {CompletionParams} from '../../utils/completionTypes';
import {
  chatSessionStore,
  defaultCompletionSettings,
  palStore,
} from '../../store';
import {styles} from './styles';
import {
  COMPLETION_PARAMS_METADATA,
  validateCompletionSettings,
} from '../../utils/modelSettings';
import {Alert, View} from 'react-native';
import {Button, SegmentedButtons, Text} from 'react-native-paper';
import {L10nContext} from '../../utils';
import {ChevronDownIcon} from '../../assets/icons';
import {Menu} from '../Menu';
interface ResetButtonProps {
  session: any;
  resetMenuVisible: boolean;
  setResetMenuVisible: (visible: boolean) => void;
  handleResetToDefault: () => void;
  handleResetToPreset: () => void;
}

const ChevronDownButtonIcon = ({color}: {color: string}) => (
  <ChevronDownIcon width={16} height={16} stroke={color} />
);

// Reset button component - conditionally renders based on session
const ResetButton = ({
  session,
  resetMenuVisible,
  setResetMenuVisible,
  handleResetToDefault,
  handleResetToPreset,
}: ResetButtonProps) => {
  const l10n = useContext(L10nContext);

  if (!session) {
    // Simple button for preset settings
    return (
      <Button
        mode="text"
        onPress={handleResetToDefault}
        style={styles.resetButton}>
        {l10n.components.chatGenerationSettingsSheet.resetToSystemDefaults}
      </Button>
    );
  }

  // Menu button for session settings
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
        onPress={handleResetToPreset}
        label={l10n.components.chatGenerationSettingsSheet.resetToPreset}
      />
      <Menu.Item
        onPress={handleResetToDefault}
        label={
          l10n.components.chatGenerationSettingsSheet.resetToSystemDefaults
        }
      />
    </Menu>
  );
};

export const ChatGenerationSettingsSheet = ({
  isVisible,
  onClose,
}: {
  isVisible: boolean;
  onClose: () => void;
}) => {
  const l10n = useContext(L10nContext);
  const session = chatSessionStore.sessions.find(
    item => item.id === chatSessionStore.activeSessionId,
  );

  const [settings, setSettings] = useState<CompletionParams>(
    defaultCompletionSettings,
  );
  const [resetMenuVisible, setResetMenuVisible] = useState(false);
  // Only use local state for sessions with active pal, otherwise derive from session
  const [localSettingsSource, setLocalSettingsSource] = useState<
    'pal' | 'custom' | null
  >(null);

  const isEditingPresetSettings = !session;

  // For existing sessions, use session's activePalId
  // For new chat sessions, use newChatPalId
  const effectivePalId = session?.activePalId || chatSessionStore.newChatPalId;
  const activePal = effectivePalId
    ? palStore.pals.find(p => p.id === effectivePalId)
    : undefined;

  // Determine the actual settings source to use
  // For existing sessions with pal: use session's settingsSource or local override
  // For new chat sessions with pal: use stored newChatSettingsSource
  const effectiveSettingsSource = activePal
    ? session
      ? localSettingsSource ?? session?.settingsSource ?? 'pal'
      : localSettingsSource ?? chatSessionStore.newChatSettingsSource // New chat session uses stored choice
    : null;

  const isUsingPalSettings = effectiveSettingsSource === 'pal';
  const showSettingsToggle = !!activePal; // Show toggle whenever there's an active pal

  // Reset and sync local state when session changes
  useEffect(() => {
    if (activePal) {
      if (session) {
        // Existing session with pal - use session's settingsSource
        setLocalSettingsSource(session.settingsSource || 'pal');
      } else {
        // New chat session with pal - use stored newChatSettingsSource
        setLocalSettingsSource(chatSessionStore.newChatSettingsSource);
      }
    } else {
      // No pal - clear local state
      setLocalSettingsSource(null);
    }
  }, [
    session,
    activePal,
    effectivePalId, // This includes both session pal and newChatPalId
  ]);

  // Load appropriate settings based on source
  useEffect(() => {
    const loadSettings = async () => {
      if (isUsingPalSettings && effectivePalId) {
        const resolved = await chatSessionStore.resolveCompletionSettings(
          session?.id, // Can be undefined for new sessions
          effectivePalId,
        );
        setSettings(resolved);
      } else {
        const customSettings =
          session?.completionSettings ??
          chatSessionStore.newChatCompletionSettings;
        setSettings(customSettings);
      }
    };

    // Only load settings when the sheet is visible
    if (isVisible) {
      loadSettings();
    }
  }, [
    session,
    effectiveSettingsSource,
    isUsingPalSettings,
    isVisible,
    effectivePalId,
  ]);

  const updateSettings = (name: string, value: any) => {
    setSettings(prev => ({...prev, [name]: value}));
  };

  const onCloseSheet = () => {
    setSettings(
      session?.completionSettings ?? chatSessionStore.newChatCompletionSettings,
    );
    onClose();
  };

  const handleSaveSettings = async () => {
    // Convert string values to numbers where needed
    const processedSettings = Object.entries(settings).reduce(
      (acc, [key, value]) => {
        const metadata = COMPLETION_PARAMS_METADATA[key];
        if (metadata?.validation.type === 'numeric') {
          // Handle numeric conversion
          let numValue: number;
          if (typeof value === 'string') {
            numValue = Number(value);
          } else if (typeof value === 'number') {
            numValue = value;
          } else {
            // If it's neither string nor number, treat as invalid. Most probably won't happen.
            acc.errors[key] =
              l10n.components.chatGenerationSettingsSheet.invalidNumericValuesMessage;
            return acc;
          }

          if (Number.isNaN(numValue)) {
            acc.errors[key] =
              l10n.components.chatGenerationSettingsSheet.invalidNumericValuesMessage;
          } else {
            acc.settings[key] = numValue;
          }
        } else {
          // For non-numeric values, keep as is
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
        l10n.components.chatGenerationSettingsSheet.invalidValues,
        l10n.components.chatGenerationSettingsSheet.pleaseCorrect +
          '\n' +
          Object.entries(allErrors)
            .map(([key, msg]) => `• ${key}: ${msg}`)
            .join('\n'),
        [{text: l10n.components.chatGenerationSettingsSheet.ok}],
      );
      return;
    }

    if (session) {
      // Only save if using custom settings (pal settings are read-only)
      if (!isUsingPalSettings) {
        await chatSessionStore.updateSessionCompletionSettings(
          processedSettings.settings,
        );
      }
    } else {
      await chatSessionStore.setNewChatCompletionSettings(
        processedSettings.settings,
      );
    }
    onCloseSheet();
  };

  const handleApplyToPreset = async () => {
    if (session) {
      // Apply current session settings to preset settings
      await handleSaveSettings(); // First save the current UI settings to the session
      await chatSessionStore.applySessionSettingsToGlobal();
      Alert.alert(
        l10n.components.chatGenerationSettingsSheet.applytoPresetAlert.title,
        l10n.components.chatGenerationSettingsSheet.applytoPresetAlert.message,
        [{text: l10n.components.chatGenerationSettingsSheet.ok}],
      );
    }
  };

  const handleResetToPreset = () => {
    if (session) {
      // For session-specific settings, reset to match Preset settings
      setSettings({...chatSessionStore.newChatCompletionSettings});
    }
    setResetMenuVisible(false);
  };

  const handleResetToDefault = () => {
    // Reset to system defaults
    setSettings({...defaultCompletionSettings});
    setResetMenuVisible(false);
  };

  return (
    <Sheet
      title={
        session
          ? l10n.components.chatGenerationSettingsSheet.title_session
          : l10n.components.chatGenerationSettingsSheet.title_preset
      }
      isVisible={isVisible}
      onClose={onCloseSheet}>
      <Sheet.ScrollView
        bottomOffset={16}
        contentContainerStyle={styles.scrollviewContainer}>
        {/* Settings Source Toggle */}
        {showSettingsToggle && (
          <View style={styles.settingsSourceContainer}>
            <Text variant="labelMedium" style={styles.settingsSourceTitle}>
              {l10n.components.chatGenerationSettingsSheet.settingsSource}
            </Text>
            <SegmentedButtons
              value={effectiveSettingsSource || 'pal'}
              onValueChange={async value => {
                const newSource = value as 'pal' | 'custom';
                setLocalSettingsSource(newSource);

                if (session) {
                  // Existing session - update session settings source
                  await chatSessionStore.updateSessionSettingsSource(newSource);
                } else {
                  // New chat session - store the choice for when session is created
                  chatSessionStore.setNewChatSettingsSource(newSource);
                }

                // Immediately reload settings for the new source
                if (newSource === 'pal' && effectivePalId) {
                  const resolved =
                    await chatSessionStore.resolveCompletionSettings(
                      session?.id, // Can be undefined for new sessions
                      effectivePalId,
                    );
                  setSettings(resolved);
                } else {
                  setSettings(
                    session?.completionSettings ??
                      chatSessionStore.newChatCompletionSettings,
                  );
                }
              }}
              buttons={[
                {
                  value: 'pal',
                  label: `Pal (${activePal.name})`,
                },
                {
                  value: 'custom',
                  label: 'Custom',
                },
              ]}
              density="medium"
            />
          </View>
        )}

        <CompletionSettings
          settings={settings}
          onChange={updateSettings}
          disabled={isUsingPalSettings}
        />
      </Sheet.ScrollView>
      <Sheet.Actions>
        <View style={styles.actionsContainer}>
          <ResetButton
            session={session}
            resetMenuVisible={resetMenuVisible}
            setResetMenuVisible={setResetMenuVisible}
            handleResetToDefault={handleResetToDefault}
            handleResetToPreset={handleResetToPreset}
          />
          <View style={styles.rightButtons}>
            {!isEditingPresetSettings && (
              <Button
                mode="contained-tonal"
                onPress={handleApplyToPreset}
                style={styles.button}>
                {l10n.components.chatGenerationSettingsSheet.saveAsPreset}
              </Button>
            )}
            <Button mode="contained" onPress={handleSaveSettings}>
              {session
                ? l10n.common.save
                : l10n.components.chatGenerationSettingsSheet.saveChanges}
            </Button>
          </View>
        </View>
      </Sheet.Actions>
    </Sheet>
  );
};
