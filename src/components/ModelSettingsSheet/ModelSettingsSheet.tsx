import React, {useState, useEffect, memo, useContext, useCallback} from 'react';
import {Button, Text, Divider, Switch, Chip} from 'react-native-paper';

import {ModelSettings} from '../../screens/ModelsScreen/ModelSettings';
import {Sheet} from '../Sheet';
import {ProjectionModelSelector} from '../ProjectionModelSelector';
import {Model, ModelOrigin} from '../../utils/types';
import {
  chatSessionStore,
  defaultCompletionSettings,
  modelStore,
  serverStore,
} from '../../store';
import {chatTemplates} from '../../utils/chat';
import {
  resolveReasoningCapability,
  EFFORT_LEVELS,
  DEFAULT_EFFORT_VALUES,
  orderEffortValues,
} from '../../utils/reasoningCapability';

import {styles} from './styles';
import {Alert, View} from 'react-native';
import {L10nContext} from '../../utils';
import {Dropdown} from '../ui';
import {
  resolveRemoteProtocol,
  type RemoteModelPreference,
} from '../../utils/remoteProtocol';
import {t} from '../../locales';
import {
  MODEL_API_MODE_VALUES,
  type ModelApiMode,
  protocolLabel,
  protocolSourceLabel,
  protocolWarningKey,
} from '../RemoteModelSheet/protocolUi';
import {CompletionSettings} from '../CompletionSettings';
import {CompletionParams} from '../../utils/completionTypes';
import {
  modelCompletionSettingsDraft,
  processCompletionSettingsDraft,
} from '../../services/completion/completionSettingsDraft';

interface ModelSettingsSheetProps {
  isVisible: boolean;
  onClose: () => void;
  model?: Model;
}

export const ModelSettingsSheet: React.FC<ModelSettingsSheetProps> = memo(
  ({isVisible, onClose, model}) => {
    const [tempModelName, setTempModelName] = useState(model?.name || '');
    const [tempChatTemplate, setTempChatTemplate] = useState(
      model?.chatTemplate || chatTemplates.default,
    );
    const [tempStopWords, setTempStopWords] = useState<string[]>(
      model?.stopWords || [],
    );
    const [tempCompletionSettings, setTempCompletionSettings] =
      useState<CompletionParams>(
        model?.completionSettings || defaultCompletionSettings,
      );
    const l10n = useContext(L10nContext);

    // Remote models have no local-only settings (chat template, stop words,
    // tokens) — only the reasoning override applies to them.
    const isRemote = model?.origin === ModelOrigin.REMOTE;
    const seedPreference = (): RemoteModelPreference =>
      model ? serverStore.getRemoteModelPreference?.(model.id) || {} : {};
    const [remoteApiMode, setRemoteApiMode] = useState<ModelApiMode>(
      () => seedPreference().wireApi || 'inherit',
    );
    const [remoteVision, setRemoteVision] = useState<'auto' | 'on' | 'off'>(
      () => seedPreference().vision || 'auto',
    );
    const [remotePreferenceDirty, setRemotePreferenceDirty] = useState(false);
    const [generationOverridesDirty, setGenerationOverridesDirty] =
      useState(false);

    // Reasoning override (seeded from the resolver so the controls show the
    // effective state). Axis-1 is reasoning yes/no; axis-2 graded effort + set.
    const capabilitySnapshot = useCallback(() => {
      if (!model || model.origin !== ModelOrigin.REMOTE) {
        return undefined;
      }
      const binding = modelStore.activeRemoteBinding;
      return binding?.modelId === model.id
        ? binding.protocolCapabilities
        : serverStore.getRemoteCatalogModel?.(model.id)?.capabilities;
    }, [model]);
    const seedReasoning = () =>
      resolveReasoningCapability(
        model,
        serverStore.remoteReasoning,
        capabilitySnapshot(),
      );
    const [isReasoningModel, setIsReasoningModel] = useState(
      () => seedReasoning().isReasoning === 'yes',
    );
    const [supportsEffort, setSupportsEffort] = useState(
      () => seedReasoning().supportsEffort,
    );
    // Selected effort levels (subset of EFFORT_LEVELS), persisted ordered
    // low→medium→high so the pill cycle stays consistent.
    const [effortSet, setEffortSet] = useState<string[]>(() =>
      orderEffortValues(seedReasoning().effortValues),
    );
    // Whether the user touched any reasoning control this session. A save
    // persists a source:'user' override only when dirty, so an unrelated save
    // (e.g. rename) never overwrites a 'detected'/'unknown'/'learned' capability.
    const [reasoningDirty, setReasoningDirty] = useState(false);

    const onIsReasoningModelChange = (value: boolean) => {
      setReasoningDirty(true);
      setIsReasoningModel(value);
    };
    const onSupportsEffortChange = (value: boolean) => {
      setReasoningDirty(true);
      setSupportsEffort(value);
      // Pre-select the standard subset on first enable so the chips read as
      // togglable (selected/unselected contrast) instead of an all-blank row.
      if (value && effortSet.length === 0) {
        setEffortSet(DEFAULT_EFFORT_VALUES);
      }
    };
    const onEffortLevelToggle = (level: string) => {
      setReasoningDirty(true);
      setEffortSet(prev =>
        orderEffortValues(
          prev.includes(level)
            ? prev.filter(v => v !== level)
            : [...prev, level],
        ),
      );
    };

    // Reset temp settings when model changes
    useEffect(() => {
      if (model) {
        setTempModelName(model.name);
        setTempChatTemplate(model.chatTemplate);
        setTempStopWords(model.stopWords || []);
        const preference =
          serverStore.getRemoteModelPreference?.(model.id) || {};
        setRemoteApiMode(preference.wireApi || 'inherit');
        setRemoteVision(preference.vision || 'auto');
        setRemotePreferenceDirty(false);
        setGenerationOverridesDirty(false);
        const cap = resolveReasoningCapability(
          model,
          serverStore.remoteReasoning,
          capabilitySnapshot(),
        );
        setIsReasoningModel(cap.isReasoning === 'yes');
        setSupportsEffort(cap.supportsEffort);
        setEffortSet(orderEffortValues(cap.effortValues));
        setReasoningDirty(false);
        const loadCompletionSettings = async () => {
          const inherited = await chatSessionStore.resolveCompletionSettings();
          const raw = model.completionSettings || {};
          setTempCompletionSettings(
            modelCompletionSettingsDraft(inherited, raw),
          );
        };
        loadCompletionSettings();
      }
    }, [model, capabilitySnapshot]);

    const handleSettingsUpdate = (name: string, value: any) => {
      setTempChatTemplate(prev => {
        const newTemplate =
          name === 'name' ? chatTemplates[value] : {...prev, [name]: value};
        return newTemplate;
      });
    };

    const handleModelNameChange = (name: string) => {
      setTempModelName(name);
    };

    const handleCompletionSettingsUpdate = (name: string, value: any) => {
      setGenerationOverridesDirty(true);
      setTempCompletionSettings(previous => ({...previous, [name]: value}));
    };

    const processCompletionSettings = (): CompletionParams | undefined => {
      const processed = processCompletionSettingsDraft(
        tempCompletionSettings,
        l10n.components.chatGenerationSettingsSheet.invalidNumericValuesMessage,
      );
      const {errors} = processed;
      if (Object.keys(errors).length > 0) {
        Alert.alert(
          l10n.components.chatGenerationSettingsSheet.invalidValues,
          l10n.components.chatGenerationSettingsSheet.pleaseCorrect +
            '\n' +
            Object.entries(errors)
              .map(([key, message]) => `• ${key}: ${message}`)
              .join('\n'),
          [{text: l10n.common.ok}],
        );
        return undefined;
      }
      return processed.settings;
    };

    const handleSaveSettings = () => {
      if (model) {
        const processedCompletionSettings = processCompletionSettings();
        if (!processedCompletionSettings) {
          return;
        }
        if (!isRemote) {
          modelStore.updateModelName(model.id, tempModelName);
          modelStore.updateModelChatTemplate(model.id, tempChatTemplate);
          modelStore.updateModelStopWords(model.id, tempStopWords);
          const persistedModel = modelStore.models.find(
            candidate => candidate.id === model.id,
          );
          if (persistedModel) {
            persistedModel.completionSettings = processedCompletionSettings;
          }
        } else {
          serverStore.setRemoteModelGenerationSettings(
            model.id,
            processedCompletionSettings,
          );
          model.completionSettings = processedCompletionSettings;
        }
        // Persist a source:'user' reasoning override only when the user
        // actually touched a reasoning control. Otherwise leave the existing
        // capability (detected/unknown/learned) intact.
        if (reasoningDirty) {
          const effortValues = orderEffortValues(effortSet);
          modelStore.setReasoningOverride(model.id, {
            isReasoning: isReasoningModel ? 'yes' : 'no',
            source: 'user',
            supportsEffort: isReasoningModel && supportsEffort,
            effortValues:
              isReasoningModel && supportsEffort ? effortValues : [],
            effortSource: isReasoningModel && supportsEffort ? 'user' : 'none',
          });
        }
        if (isRemote && remotePreferenceDirty) {
          serverStore.setRemoteModelPreference?.(model.id, {
            ...serverStore.getRemoteModelPreference?.(model.id),
            wireApi: remoteApiMode === 'inherit' ? undefined : remoteApiMode,
            vision: remoteVision,
          });
        }
        onClose();
      }
    };

    const handleCancelSettings = () => {
      if (model) {
        // Reset to store values
        setTempModelName(model.name);
        setTempChatTemplate(model.chatTemplate);
        setTempStopWords(model.stopWords || []);
      }
      onClose();
    };

    const handleReset = () => {
      if (model && !isRemote) {
        // Reset to model default values
        modelStore.resetModelName(model.id);
        modelStore.resetModelChatTemplate(model.id);
        modelStore.resetModelStopWords(model.id);
        setTempModelName(model.name);
        setTempChatTemplate(model.chatTemplate);
        setTempStopWords(model.stopWords || []);
      }
    };

    if (!model) {
      return null;
    }
    const modelServer = isRemote
      ? serverStore.servers.find(candidate => candidate.id === model.serverId)
      : undefined;
    const protocol = isRemote
      ? resolveRemoteProtocol({
          modelPreference: {
            ...serverStore.getRemoteModelPreference?.(model.id),
            wireApi: remoteApiMode === 'inherit' ? undefined : remoteApiMode,
          },
          apiMode: modelServer?.apiMode,
          catalog: serverStore.getRemoteCatalogModel?.(model.id),
        })
      : undefined;
    const binding = modelStore.activeRemoteBinding;
    const reselectRequired =
      isRemote &&
      binding?.modelId === model.id &&
      (remotePreferenceDirty ||
        generationOverridesDirty ||
        (protocol?.wireApi !== undefined &&
          binding.wireApi !== protocol.wireApi));
    const protocolWarning = protocol ? protocolWarningKey(protocol) : undefined;
    const apiOptions = MODEL_API_MODE_VALUES.map(value => ({
      value,
      label:
        value === 'inherit'
          ? l10n.settings.apiProtocolInherit
          : value === 'chat-completions'
            ? l10n.settings.apiProtocolChatCompletions
            : l10n.settings.apiProtocolResponses,
      testID: `model-api-protocol-option-${value}`,
    }));
    const visionOptions = [
      {
        value: 'auto',
        label: l10n.components.modelSettingsSheet.remoteVisionAuto,
        testID: 'remote-vision-option-auto',
      },
      {
        value: 'on',
        label: l10n.components.modelSettingsSheet.remoteVisionOn,
        testID: 'remote-vision-option-on',
      },
      {
        value: 'off',
        label: l10n.components.modelSettingsSheet.remoteVisionOff,
        testID: 'remote-vision-option-off',
      },
    ];

    return (
      <Sheet
        isVisible={isVisible}
        onClose={handleCancelSettings}
        title={l10n.components.modelSettingsSheet.modelSettings}
        displayFullHeight>
        <Sheet.ScrollView
          bottomOffset={16}
          contentContainerStyle={styles.sheetScrollViewContainer}>
          {/* Chat template, stop words and token settings are local-only and
              don't apply to remote models. */}
          {!isRemote && (
            <ModelSettings
              modelName={tempModelName}
              chatTemplate={tempChatTemplate}
              stopWords={tempStopWords}
              onChange={handleSettingsUpdate}
              onStopWordsChange={value => setTempStopWords(value || [])}
              onModelNameChange={handleModelNameChange}
            />
          )}

          <Divider style={styles.multimodalDivider} />
          <Text style={styles.multimodalSectionTitle}>
            {l10n.components.modelSettingsSheet.generationOverrides}
          </Text>
          <Text variant="bodySmall" style={styles.reasoningHelp}>
            {l10n.components.modelSettingsSheet.generationOverridesHelp}
          </Text>
          <CompletionSettings
            settings={tempCompletionSettings}
            onChange={handleCompletionSettingsUpdate}
            allowInherit
          />

          {isRemote && protocol && (
            <>
              <Text style={styles.multimodalSectionTitle}>
                {l10n.components.modelSettingsSheet.remoteProtocolSection}
              </Text>
              <Text>{l10n.settings.apiProtocol}</Text>
              <Dropdown
                testID="model-api-protocol-dropdown"
                value={remoteApiMode}
                options={apiOptions}
                onChange={value => {
                  setRemoteApiMode(value as ModelApiMode);
                  setRemotePreferenceDirty(true);
                }}
              />
              <Text variant="bodySmall" style={styles.reasoningHelp}>
                {l10n.components.modelSettingsSheet.remoteProtocolHelp}
              </Text>
              <Text testID="model-effective-protocol" style={styles.statusText}>
                {t(l10n.settings.apiProtocolEffective, {
                  protocol: protocolLabel(protocol.wireApi, {
                    chatCompletions: l10n.settings.apiProtocolChatCompletions,
                    responses: l10n.settings.apiProtocolResponses,
                    unsupported: l10n.settings.apiProtocolUnsupported,
                  }),
                  source: protocolSourceLabel(protocol.source, {
                    modelOverride: l10n.settings.apiProtocolSourceModel,
                    serverOverride: l10n.settings.apiProtocolSourceServer,
                    liveCatalog: l10n.settings.apiProtocolSourceLiveCatalog,
                    cachedCatalog: l10n.settings.apiProtocolSourceCachedCatalog,
                    compatibilityDefault:
                      l10n.settings.apiProtocolSourceCompatibility,
                  }),
                })}
              </Text>
              {protocolWarning && (
                <Text style={styles.warningText}>
                  {protocolWarning === 'unsupported'
                    ? l10n.settings.apiProtocolWarningUnsupported
                    : protocolWarning === 'contradiction'
                      ? l10n.settings.apiProtocolWarningContradiction
                      : l10n.settings.apiProtocolWarningUnknown}
                </Text>
              )}
              <Text>{l10n.components.modelSettingsSheet.remoteVision}</Text>
              <Dropdown
                testID="remote-vision-dropdown"
                value={remoteVision}
                options={visionOptions}
                onChange={value => {
                  setRemoteVision(value as 'auto' | 'on' | 'off');
                  setRemotePreferenceDirty(true);
                }}
              />
              <Text variant="bodySmall" style={styles.reasoningHelp}>
                {l10n.components.modelSettingsSheet.remoteVisionHelp}
              </Text>
              {reselectRequired && (
                <Text
                  testID="remote-reselect-required"
                  style={styles.warningText}>
                  {l10n.components.modelSettingsSheet.reselectRequired}
                </Text>
              )}
              <Divider style={styles.multimodalDivider} />
            </>
          )}

          {/* Multimodal Settings Section */}
          {model.supportsMultimodal && (
            <>
              <Divider style={styles.multimodalDivider} />
              <Text style={styles.multimodalSectionTitle}>
                {l10n.models.multimodal.settings}
              </Text>
              <ProjectionModelSelector
                model={model}
                onProjectionModelSelect={projectionModelId => {
                  modelStore.setDefaultProjectionModel(
                    model.id,
                    projectionModelId,
                  );
                }}
              />
            </>
          )}

          {/* Reasoning override (axis 1 + axis 2). Manual escape hatch when
              detection is wrong or impossible (remote models). */}
          <Divider style={styles.multimodalDivider} />
          <Text style={styles.multimodalSectionTitle}>
            {l10n.components.modelSettingsSheet.reasoningSection}
          </Text>
          <View style={styles.reasoningRow}>
            <Text>{l10n.components.modelSettingsSheet.isReasoningModel}</Text>
            <Switch
              testID="reasoning-is-reasoning-switch"
              value={isReasoningModel}
              onValueChange={onIsReasoningModelChange}
              disabled={isRemote && protocol?.supported === false}
            />
          </View>
          <Text variant="bodySmall" style={styles.reasoningHelp}>
            {l10n.components.modelSettingsSheet.isReasoningModelHelp}
          </Text>
          {isReasoningModel && (
            <>
              <View style={styles.reasoningRow}>
                <Text>{l10n.components.modelSettingsSheet.supportsEffort}</Text>
                <Switch
                  testID="reasoning-supports-effort-switch"
                  value={supportsEffort}
                  onValueChange={onSupportsEffortChange}
                  disabled={isRemote && protocol?.supported === false}
                />
              </View>
              {supportsEffort && (
                <>
                  <Text variant="bodySmall" style={styles.reasoningHelp}>
                    {l10n.components.modelSettingsSheet.effortValues}
                  </Text>
                  <View style={styles.effortChipsRow}>
                    {EFFORT_LEVELS.map(level => (
                      <Chip
                        key={level}
                        testID={`effort-chip-${level}`}
                        selected={effortSet.includes(level)}
                        showSelectedCheck
                        disabled={isRemote && protocol?.supported === false}
                        onPress={() => onEffortLevelToggle(level)}>
                        {l10n.components.modelSettingsSheet.effortLevels[level]}
                      </Chip>
                    ))}
                  </View>
                </>
              )}
            </>
          )}
        </Sheet.ScrollView>
        <Sheet.Actions>
          <View style={styles.secondaryButtons}>
            {!isRemote && (
              <Button mode="text" onPress={handleReset}>
                {l10n.common.reset}
              </Button>
            )}
            <Button mode="text" onPress={handleCancelSettings}>
              {l10n.common.cancel}
            </Button>
          </View>
          <Button mode="contained" onPress={handleSaveSettings}>
            {l10n.components.modelSettingsSheet.saveChanges}
          </Button>
        </Sheet.Actions>
      </Sheet>
    );
  },
);
