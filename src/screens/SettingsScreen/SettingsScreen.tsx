import React, {useState, useEffect, useRef, useContext} from 'react';
import {
  View,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  ScrollView,
  TextInput as RNTextInput,
  Alert,
  Linking,
  TouchableOpacity,
} from 'react-native';

import {debounce} from 'lodash';
import {observer} from 'mobx-react-lite';
import {toJS} from 'mobx';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useIsFocused} from '@react-navigation/native';
import {
  Switch,
  Text,
  Card,
  Button,
  Icon,
  IconButton,
  List,
  SegmentedButtons,
} from 'react-native-paper';

import {
  GlobeIcon,
  MoonIcon,
  CpuChipIcon,
  ShareIcon,
  LinkExternalIcon,
  VolumeOnIcon,
} from '../../assets/icons';

import {
  TextInput,
  Menu,
  Divider,
  HFTokenSheet,
  InputSlider,
} from '../../components';

import {useTheme} from '../../hooks';

import {createStyles} from './styles';

import {modelStore, uiStore, hfStore, ttsStore} from '../../store';
import {languageDisplayNames} from '../../locales';

import {CacheType} from '../../utils/types';
import {
  L10nContext,
  formatBytes,
  clearAllSessionCaches,
  getSessionCacheInfo,
} from '../../utils';
import {t} from '../../locales';
import {checkGpuSupport} from '../../utils/deviceCapabilities';
import {exportLegacyChatSessions} from '../../utils/exportUtils';
import {getDeviceOptions, DeviceOption} from '../../utils/deviceSelection';
import {
  inferBackendType,
  getAllowedCacheTypeKOptions,
  getAllowedCacheTypeVOptions,
} from '../../utils/flashAttnCompatibility';
import {
  getSearchProvider,
  setSearchProvider,
  getSearchEndpoint,
  setSearchEndpoint,
  getGoogleCseId,
  setGoogleCseId,
  getApiKey,
  setApiKey,
  KEY_BASED_PROVIDERS,
  WebSearchProvider,
} from '../../services/talents/webSearchConfig';
import {
  addDocument,
  deleteDocument,
  listDocuments,
  IndexedDocSummary,
} from '../../utils/localDocsStore';

// OpenCL documentation URL (not localized)
const OPENCL_DOCS_URL =
  'https://github.com/ggml-org/llama.cpp/blob/master/docs/backend/OPENCL.md#model-preparation';

export const SettingsScreen: React.FC = observer(() => {
  const l10n = useContext(L10nContext);
  const theme = useTheme();
  const styles = createStyles(theme);
  const isFocused = useIsFocused();
  const [contextSize, setContextSize] = useState(
    modelStore.contextInitParams.n_ctx.toString(),
  );
  const [isValidInput, setIsValidInput] = useState(true);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const inputRef = useRef<RNTextInput>(null);
  const [showKeyCacheMenu, setShowKeyCacheMenu] = useState(false);
  const [showValueCacheMenu, setShowValueCacheMenu] = useState(false);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const [showHfTokenDialog, setShowHfTokenDialog] = useState(false);
  const [gpuSupported, setGpuSupported] = useState(false);
  const [keyCacheAnchor, setKeyCacheAnchor] = useState<{x: number; y: number}>({
    x: 0,
    y: 0,
  });
  const [valueCacheAnchor, setValueCacheAnchor] = useState<{
    x: number;
    y: number;
  }>({x: 0, y: 0});
  const [languageAnchor, setLanguageAnchor] = useState<{x: number; y: number}>({
    x: 0.0,
    y: 0.0,
  });
  const [deviceOptions, setDeviceOptions] = useState<DeviceOption[]>([]);
  const [currentBackend, setCurrentBackend] = useState<
    'metal' | 'opencl' | 'hexagon' | 'cpu' | 'blas'
  >(Platform.OS === 'ios' ? 'metal' : 'cpu');
  const keyCacheButtonRef = useRef<View>(null);
  const valueCacheButtonRef = useRef<View>(null);
  const languageButtonRef = useRef<View>(null);
  const debouncedUpdateStore = useRef(
    debounce((value: number) => {
      modelStore.setNContext(value);
    }, 500),
  ).current;

const [webSearchProvider, setWebSearchProviderState] =
  useState<WebSearchProvider>('searxng');
const [webSearchUrl, setWebSearchUrl] = useState('');
const [webSearchApiKey, setWebSearchApiKeyState] = useState('');
const [googleCseId, setGoogleCseIdState] = useState('');
const [showProviderMenu, setShowProviderMenu] = useState(false);
const [providerAnchor, setProviderAnchor] = useState<{x: number; y: number}>({
  x: 0,
  y: 0,
});
const providerButtonRef = useRef<View>(null);

const PROVIDER_LABELS: Record<WebSearchProvider, string> = {
  langsearch: 'LangSearch',
  searxng: 'SearXNG (self-hosted)',
  tavily: 'Tavily',
  brave: 'Brave Search',
  serper: 'Serper',
  exa: 'Exa',
  google_cse: 'Google Custom Search',
};

useEffect(() => {
  getSearchProvider().then(setWebSearchProviderState);
  getSearchEndpoint().then(url => {
    if (url) {
      setWebSearchUrl(url);
    }
  });
  getGoogleCseId().then(id => {
    if (id) {
      setGoogleCseIdState(id);
    }
  });
}, []);

// Reload the stored key whenever the selected provider changes
useEffect(() => {
  if (KEY_BASED_PROVIDERS.includes(webSearchProvider)) {
    getApiKey(webSearchProvider).then(key =>
      setWebSearchApiKeyState(key ?? ''),
    );
  }
}, [webSearchProvider]);

const debouncedSaveSearchUrl = useRef(
  debounce((value: string) => {
    setSearchEndpoint(value);
  }, 500),
).current;

const debouncedSaveApiKey = useRef(
  debounce((provider: WebSearchProvider, value: string) => {
    setApiKey(provider, value);
  }, 500),
).current;

const debouncedSaveGoogleCseId = useRef(
  debounce((value: string) => {
    setGoogleCseId(value);
  }, 500),
).current;

const handleWebSearchUrlChange = (text: string) => {
  setWebSearchUrl(text);
  debouncedSaveSearchUrl(text);
};

const handleWebSearchApiKeyChange = (text: string) => {
  setWebSearchApiKeyState(text);
  debouncedSaveApiKey(webSearchProvider, text);
};

const handleGoogleCseIdChange = (text: string) => {
  setGoogleCseIdState(text);
  debouncedSaveGoogleCseId(text);
};

const handleProviderSelect = (provider: WebSearchProvider) => {
  setWebSearchProviderState(provider);
  setSearchProvider(provider);
  setShowProviderMenu(false);
};

const handleProviderPress = () => {
  providerButtonRef.current?.measure((x, y, width, height, pageX, pageY) => {
    setProviderAnchor({x: pageX, y: pageY + height});
    setShowProviderMenu(true);
  });
};

const [localDocs, setLocalDocs] = useState<IndexedDocSummary[]>([]);
const [newDocTitle, setNewDocTitle] = useState('');
const [newDocText, setNewDocText] = useState('');
const [isIndexingDoc, setIsIndexingDoc] = useState(false);
const [docError, setDocError] = useState<string | null>(null);

const refreshLocalDocs = () => {
  listDocuments()
    .then(setLocalDocs)
    .catch(e => console.warn('Failed to list local documents:', e));
};

useEffect(() => {
  refreshLocalDocs();
}, []);

const handleAddDocument = async () => {
  setDocError(null);
  setIsIndexingDoc(true);
  try {
    await addDocument(newDocTitle, newDocText);
    setNewDocTitle('');
    setNewDocText('');
    refreshLocalDocs();
  } catch (e) {
    setDocError(e instanceof Error ? e.message : String(e));
  } finally {
    setIsIndexingDoc(false);
  }
};

const handleDeleteDocument = async (title: string) => {
  try {
    await deleteDocument(title);
    refreshLocalDocs();
  } catch (e) {
    console.warn('Failed to delete document:', e);
  }
};

  useEffect(() => {
    setContextSize(modelStore.contextInitParams.n_ctx.toString());

    // Check for GPU support (Metal on iOS 18+, OpenCL on Android with Adreno + CPU features)
    const checkGpuCapabilities = async () => {
      const gpuCapabilities = await checkGpuSupport();
      setGpuSupported(gpuCapabilities.isSupported);
    };

    checkGpuCapabilities().catch(error => {
      console.warn('Failed to check GPU capabilities:', error);
      setGpuSupported(false);
    });

    // Load available device options
    const loadDeviceOptions = async () => {
      try {
        const options = await getDeviceOptions();
        setDeviceOptions(options);
      } catch (error) {
        console.warn('Failed to load device options:', error);
      }
    };

    loadDeviceOptions();
  }, []);

  // Re-sync the displayed context size when the screen regains focus or the
  // global n_ctx changes elsewhere (e.g. the chat banner's increase-context
  // flow). Skipped while the input is actively edited so it never fights typing.
  const configuredNCtx = modelStore.contextInitParams.n_ctx;
  useEffect(() => {
    if (isFocused && !inputRef.current?.isFocused()) {
      setContextSize(configuredNCtx.toString());
      setIsValidInput(true);
    }
  }, [isFocused, configuredNCtx]);

  // Compute current backend type based on device selection
  // Convert MobX observable to plain JS for dependency tracking
  const devicesKey = JSON.stringify(toJS(modelStore.contextInitParams.devices));

  useEffect(() => {
    const updateBackend = async () => {
      const backend = await inferBackendType(
        modelStore.contextInitParams.devices,
      );
      setCurrentBackend(backend);
    };

    updateBackend();
  }, [devicesKey]);

  useEffect(() => {
    return () => {
      debouncedUpdateStore.cancel();
    };
  }, [debouncedUpdateStore]);

  const handleOutsidePress = () => {
    Keyboard.dismiss();
    inputRef.current?.blur();
    setContextSize(modelStore.contextInitParams.n_ctx.toString());
    setIsValidInput(true);
    setShowKeyCacheMenu(false);
    setShowValueCacheMenu(false);
    setShowLanguageMenu(false);
  };

  const handleContextSizeChange = (text: string) => {
    setContextSize(text);
    const value = parseInt(text, 10);
    if (!isNaN(value) && value >= modelStore.MIN_CONTEXT_SIZE) {
      setIsValidInput(true);
      debouncedUpdateStore(value);
    } else {
      setIsValidInput(false);
    }
  };

  const currentFlashAttnType =
    modelStore.contextInitParams.flash_attn_type ??
    (Platform.OS === 'ios' ? 'auto' : 'off');

  // Get dynamic cache type options based on flash attention compatibility
  const cacheTypeKOptions = getAllowedCacheTypeKOptions(
    currentFlashAttnType as 'auto' | 'on' | 'off',
    currentBackend,
  );

  const cacheTypeVOptions = getAllowedCacheTypeVOptions(
    currentFlashAttnType as 'auto' | 'on' | 'off',
    currentBackend,
  );

  const getCacheTypeLabel = (
    value: CacheType | string,
    isValueCache = false,
  ) => {
    const options = isValueCache ? cacheTypeVOptions : cacheTypeKOptions;
    return options.find(option => option.value === value)?.label || value;
  };

  const getCurrentDeviceId = (): string => {
    const devices = modelStore.contextInitParams.devices;
    const nGpuLayers = modelStore.contextInitParams.n_gpu_layers ?? 0;

    // iOS
    if (Platform.OS === 'ios') {
      if (!devices || devices.length === 0) {
        return nGpuLayers === 0 ? 'cpu' : 'auto';
      }
      if (devices[0] === 'Metal') {
        return 'gpu';
      }
      if (devices[0] === 'CPU') {
        return 'cpu';
      }
      return 'auto';
    }

    // Android
    // No auto mode on Android - always explicit device selection
    if (!devices || devices.length === 0 || devices[0] === 'CPU') {
      return 'cpu';
    }

    if (devices[0].startsWith('HTP')) {
      return 'hexagon';
    }

    // GPU device (Adreno, etc.)
    return 'gpu';
  };

  const handleDeviceSelect = (option: DeviceOption) => {
    modelStore.setDevices(option.devices);

    // Only update flash attention if current value is not valid for the selected device
    const currentFlashAttn =
      modelStore.contextInitParams.flash_attn_type ??
      (Platform.OS === 'ios' ? 'auto' : 'off');

    if (!option.valid_flash_attn_types.includes(currentFlashAttn)) {
      // Current setting is invalid for this device, use the default
      modelStore.setFlashAttnType(option.default_flash_attn_type);
    }
    // Otherwise, keep the user's current flash attention preference
  };

  const handleKeyCachePress = () => {
    keyCacheButtonRef.current?.measure((x, y, width, height, pageX, pageY) => {
      setKeyCacheAnchor({x: pageX, y: pageY + height});
      setShowKeyCacheMenu(true);
    });
  };

  const handleValueCachePress = () => {
    valueCacheButtonRef.current?.measure(
      (x, y, width, height, pageX, pageY) => {
        setValueCacheAnchor({x: pageX, y: pageY + height});
        setShowValueCacheMenu(true);
      },
    );
  };

  const handleLanguagePress = () => {
    languageButtonRef.current?.measure((x, y, width, height, pageX, pageY) => {
      setLanguageAnchor({x: pageX, y: pageY + height});
      setShowLanguageMenu(true);
    });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <TouchableWithoutFeedback onPress={handleOutsidePress} accessible={false}>
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled">
          {/* Model Initialization Settings */}
          <Card elevation={0} style={styles.card}>
            <Card.Title title={l10n.settings.modelInitializationSettings} />
            <Card.Content>
              {/* Device Selection */}

              <View style={styles.settingItemContainer}>
                {/* Show full UI when multiple device options available */}
                {deviceOptions.length > 1 ? (
                  <>
                    <Text variant="titleMedium" style={styles.textLabel}>
                      {Platform.OS === 'ios'
                        ? l10n.settings.deviceSelectionIOS
                        : l10n.settings.deviceSelection}
                    </Text>
                    <Text variant="labelSmall" style={styles.textDescription}>
                      {Platform.OS === 'ios'
                        ? l10n.settings.deviceSelectionIOSDescription
                        : l10n.settings.deviceSelectionAndroidDescription}
                    </Text>
                    <SegmentedButtons
                      value={getCurrentDeviceId()}
                      onValueChange={deviceId => {
                        const option = deviceOptions.find(
                          opt => opt.id === deviceId,
                        );
                        if (option) {
                          handleDeviceSelect(option);
                        }
                      }}
                      density="medium"
                      buttons={deviceOptions.map(option => ({
                        value: option.id,
                        label: option.label,
                        labelStyle: {
                          fontSize: 10,
                        },
                        testID: `device-option-${option.id}`,
                      }))}
                      style={styles.segmentedButtons}
                    />

                    {/* GPU Layers Slider */}
                    <InputSlider
                      testID="gpu-layers-slider"
                      value={modelStore.contextInitParams.n_gpu_layers}
                      onValueChange={value =>
                        modelStore.setNGPULayers(Math.round(value))
                      }
                      min={0}
                      max={99}
                      step={1}
                    />
                    <Text variant="labelSmall" style={styles.textDescription}>
                      {t(l10n.settings.layersOnGPU, {
                        gpuLayers:
                          modelStore.contextInitParams.n_gpu_layers.toString(),
                      })}
                    </Text>
                  </>
                ) : (
                  /* Simplified UI when only CPU available */
                  <>
                    <Text variant="titleMedium" style={styles.textLabel}>
                      {l10n.settings.deviceSelection}
                    </Text>
                    <Text variant="labelSmall" style={styles.textDescription}>
                      {l10n.settings.cpuOnlyNoAccelerators}
                    </Text>
                  </>
                )}

                {/* OpenCL quantization note for Android */}
                {Platform.OS === 'android' &&
                  gpuSupported &&
                  (modelStore.contextInitParams.n_gpu_layers ?? 0) > 0 && (
                    <View>
                      <Text variant="labelSmall" style={styles.textDescription}>
                        {l10n.settings.openCLQuantizationNote}
                      </Text>
                      <TouchableOpacity
                        onPress={() => Linking.openURL(OPENCL_DOCS_URL)}
                        style={styles.linkContainer}>
                        <Text
                          variant="labelSmall"
                          style={[
                            styles.textDescription,
                            {color: theme.colors.primary},
                          ]}>
                          {l10n.settings.openCLDocsLink}
                        </Text>
                        <LinkExternalIcon
                          width={12}
                          height={12}
                          stroke={theme.colors.primary}
                          style={styles.linkIcon}
                        />
                      </TouchableOpacity>
                    </View>
                  )}
              </View>
              <Divider />

              {/* Context Size */}
              <View style={styles.settingItemContainer}>
                <Text variant="titleMedium" style={styles.textLabel}>
                  {l10n.settings.contextSize}
                </Text>
                <TextInput
                  ref={inputRef}
                  testID="context-size-input"
                  style={[
                    styles.textInput,
                    !isValidInput && styles.invalidInput,
                  ]}
                  keyboardType="numeric"
                  value={contextSize}
                  onChangeText={handleContextSizeChange}
                  placeholder={t(l10n.settings.contextSizePlaceholder, {
                    minContextSize: modelStore.MIN_CONTEXT_SIZE.toString(),
                  })}
                />
                {!isValidInput && (
                  <Text style={styles.errorText}>
                    {t(l10n.settings.invalidContextSizeError, {
                      minContextSize: modelStore.MIN_CONTEXT_SIZE.toString(),
                    })}
                  </Text>
                )}
                <Text variant="labelSmall" style={styles.textDescription}>
                  {l10n.settings.modelReloadNotice}
                </Text>
              </View>

              {/* Advanced Settings */}
              <List.Accordion
                title={l10n.settings.advancedSettings}
                titleStyle={styles.accordionTitle}
                style={styles.advancedAccordion}
                expanded={showAdvancedSettings}
                onPress={() => setShowAdvancedSettings(!showAdvancedSettings)}>
                <View style={styles.advancedSettingsContent}>
                  {/* Batch Size Slider */}
                  <View style={styles.settingItemContainer}>
                    <InputSlider
                      testID="batch-size-slider"
                      label={l10n.settings.batchSize}
                      value={modelStore.contextInitParams.n_batch}
                      onValueChange={value =>
                        modelStore.setNBatch(Math.round(value))
                      }
                      min={1}
                      max={4096}
                      step={1}
                    />
                    <Text variant="labelSmall" style={styles.textDescription}>
                      {t(l10n.settings.batchSizeDescription, {
                        batchSize:
                          modelStore.contextInitParams.n_batch.toString(),
                        effectiveBatch:
                          modelStore.contextInitParams.n_batch >
                          modelStore.contextInitParams.n_ctx
                            ? ` (${l10n.settings.effectiveLabel}: ${modelStore.contextInitParams.n_ctx})`
                            : '',
                      })}
                    </Text>
                  </View>
                  <Divider />

                  {/* Physical Batch Size Slider */}
                  <View style={styles.settingItemContainer}>
                    <InputSlider
                      testID="ubatch-size-slider"
                      label={l10n.settings.physicalBatchSize}
                      value={modelStore.contextInitParams.n_ubatch}
                      onValueChange={value =>
                        modelStore.setNUBatch(Math.round(value))
                      }
                      min={1}
                      max={4096}
                      step={1}
                    />
                    <Text variant="labelSmall" style={styles.textDescription}>
                      {t(l10n.settings.physicalBatchSizeDescription, {
                        physicalBatchSize:
                          modelStore.contextInitParams.n_ubatch.toString(),
                        effectivePhysicalBatch:
                          modelStore.contextInitParams.n_ubatch >
                          Math.min(
                            modelStore.contextInitParams.n_batch,
                            modelStore.contextInitParams.n_ctx,
                          )
                            ? ` (${l10n.settings.effectiveLabel}: ${Math.min(
                                modelStore.contextInitParams.n_batch,
                                modelStore.contextInitParams.n_ctx,
                              )})`
                            : '',
                      })}
                    </Text>
                  </View>
                  <Divider />

                  {/* Thread Count Slider */}
                  <View style={styles.settingItemContainer}>
                    <InputSlider
                      testID="thread-count-slider"
                      label={l10n.settings.cpuThreads}
                      value={modelStore.contextInitParams.n_threads}
                      onValueChange={value =>
                        modelStore.setNThreads(Math.round(value))
                      }
                      min={1}
                      max={modelStore.max_threads}
                      step={1}
                    />
                    <Text variant="labelSmall" style={styles.textDescription}>
                      {t(l10n.settings.cpuThreadsDescription, {
                        threads:
                          modelStore.contextInitParams.n_threads.toString(),
                        maxThreads: modelStore.max_threads.toString(),
                      })}
                    </Text>
                  </View>
                  <Divider />

                  {/* Image Max Tokens Slider */}
                  <View style={styles.settingItemContainer}>
                    <InputSlider
                      testID="image-max-tokens-slider"
                      label={l10n.settings.imageMaxTokens}
                      value={
                        modelStore.contextInitParams.image_max_tokens ?? 512
                      }
                      onValueChange={value =>
                        modelStore.setImageMaxTokens(Math.round(value))
                      }
                      min={256}
                      max={4096}
                      step={1}
                    />
                    <Text variant="labelSmall" style={styles.textDescription}>
                      {t(l10n.settings.imageMaxTokensDescription, {
                        tokens: (
                          modelStore.contextInitParams.image_max_tokens ?? 512
                        ).toString(),
                        effectiveTokens:
                          (modelStore.contextInitParams.image_max_tokens ??
                            512) > modelStore.contextInitParams.n_ctx
                            ? ` (${l10n.settings.effectiveLabel}: ${modelStore.contextInitParams.n_ctx})`
                            : '',
                      })}
                    </Text>
                  </View>
                  <Divider />

                  {/* Flash Attention Type */}
                  <View style={styles.settingItemContainer}>
                    <Text variant="titleMedium" style={styles.textLabel}>
                      {l10n.settings.flashAttention}
                    </Text>
                    <Text variant="labelSmall" style={styles.textDescription}>
                      {Platform.OS === 'ios'
                        ? l10n.settings.flashAttentionIOSDescription
                        : l10n.settings.flashAttentionAndroidDescription}
                    </Text>
                    <SegmentedButtons
                      value={
                        modelStore.contextInitParams.flash_attn_type ??
                        (Platform.OS === 'ios' ? 'auto' : 'off')
                      }
                      onValueChange={value =>
                        modelStore.setFlashAttnType(
                          value as 'auto' | 'on' | 'off',
                        )
                      }
                      density="high"
                      buttons={(() => {
                        const currentDeviceId = getCurrentDeviceId();
                        const currentDevice = deviceOptions.find(
                          opt => opt.id === currentDeviceId,
                        );
                        const validTypes =
                          currentDevice?.valid_flash_attn_types || [
                            'auto',
                            'on',
                            'off',
                          ];

                        return [
                          {
                            value: 'auto',
                            label: l10n.settings.flashAttentionAuto,
                            disabled: !validTypes.includes('auto'),
                          },
                          {
                            value: 'on',
                            label: l10n.settings.flashAttentionOn,
                            disabled: !validTypes.includes('on'),
                          },
                          {
                            value: 'off',
                            label: l10n.settings.flashAttentionOff,
                            disabled: !validTypes.includes('off'),
                          },
                        ];
                      })()}
                      style={styles.segmentedButtons}
                    />
                  </View>
                  <Divider />

                  {/* Cache Type K Selection */}
                  <View style={styles.settingItemContainer}>
                    <View style={styles.switchContainer}>
                      <View style={styles.textContainer}>
                        <Text variant="titleMedium" style={styles.textLabel}>
                          {l10n.settings.keyCacheType}
                        </Text>
                        <Text
                          variant="labelSmall"
                          style={styles.textDescription}>
                          {modelStore.contextInitParams.flash_attn_type &&
                          modelStore.contextInitParams.flash_attn_type !== 'off'
                            ? l10n.settings.keyCacheTypeDescription
                            : l10n.settings.keyCacheTypeDisabledDescription}
                        </Text>
                      </View>
                      <View style={styles.menuContainer}>
                        <Button
                          ref={keyCacheButtonRef}
                          mode="outlined"
                          onPress={handleKeyCachePress}
                          style={styles.menuButton}
                          contentStyle={styles.buttonContent}
                          disabled={
                            !modelStore.contextInitParams.flash_attn_type ||
                            modelStore.contextInitParams.flash_attn_type ===
                              'off'
                          }
                          icon={({size, color}) => (
                            <Icon
                              source="chevron-down"
                              size={size}
                              color={color}
                            />
                          )}>
                          {getCacheTypeLabel(
                            modelStore.contextInitParams.cache_type_k,
                            false,
                          )}
                        </Button>
                        <Menu
                          visible={showKeyCacheMenu}
                          onDismiss={() => setShowKeyCacheMenu(false)}
                          anchor={keyCacheAnchor}
                          selectable>
                          {cacheTypeKOptions.map(option => (
                            <Menu.Item
                              key={option.value}
                              style={styles.menu}
                              label={option.label}
                              selected={
                                option.value ===
                                modelStore.contextInitParams.cache_type_k
                              }
                              disabled={option.disabled}
                              onPress={() => {
                                if (!option.disabled) {
                                  modelStore.setCacheTypeK(option.value);
                                  setShowKeyCacheMenu(false);
                                }
                              }}
                            />
                          ))}
                        </Menu>
                      </View>
                    </View>
                  </View>
                  <Divider />

                  {/* Cache Type V Selection */}
                  <View style={styles.settingItemContainer}>
                    <View style={styles.switchContainer}>
                      <View style={styles.textContainer}>
                        <Text variant="titleMedium" style={styles.textLabel}>
                          {l10n.settings.valueCacheType}
                        </Text>
                        <Text
                          variant="labelSmall"
                          style={styles.textDescription}>
                          {modelStore.contextInitParams.flash_attn_type &&
                          modelStore.contextInitParams.flash_attn_type !== 'off'
                            ? l10n.settings.valueCacheTypeDescription
                            : l10n.settings.valueCacheTypeDisabledDescription}
                        </Text>
                      </View>
                      <View style={styles.menuContainer}>
                        <Button
                          ref={valueCacheButtonRef}
                          mode="outlined"
                          onPress={handleValueCachePress}
                          style={styles.menuButton}
                          contentStyle={styles.buttonContent}
                          disabled={
                            !modelStore.contextInitParams.flash_attn_type ||
                            modelStore.contextInitParams.flash_attn_type ===
                              'off'
                          }
                          icon={({size, color}) => (
                            <Icon
                              source="chevron-down"
                              size={size}
                              color={color}
                            />
                          )}>
                          {getCacheTypeLabel(
                            modelStore.contextInitParams.cache_type_v,
                            true,
                          )}
                        </Button>
                        <Menu
                          visible={showValueCacheMenu}
                          onDismiss={() => setShowValueCacheMenu(false)}
                          anchor={valueCacheAnchor}
                          selectable>
                          {cacheTypeVOptions.map(option => (
                            <Menu.Item
                              key={option.value}
                              label={option.label}
                              style={styles.menu}
                              selected={
                                option.value ===
                                modelStore.contextInitParams.cache_type_v
                              }
                              disabled={option.disabled}
                              onPress={() => {
                                if (!option.disabled) {
                                  modelStore.setCacheTypeV(option.value);
                                  setShowValueCacheMenu(false);
                                }
                              }}
                            />
                          ))}
                        </Menu>
                      </View>
                    </View>
                  </View>
                </View>
              </List.Accordion>
            </Card.Content>
          </Card>

          {/* Web Search Settings */}
<Card elevation={0} style={styles.card}>
  <Card.Title title="Web Search" />
  <Card.Content>
    <View style={styles.settingItemContainer}>
      <View style={styles.switchContainer}>
        <View style={styles.textContainer}>
          <Text variant="titleMedium" style={styles.textLabel}>
            Search Provider
          </Text>
        </View>
        <View style={styles.menuContainer}>
          <Button
            ref={providerButtonRef}
            testID="web-search-provider-button"
            mode="outlined"
            onPress={handleProviderPress}
            style={styles.menuButton}
            contentStyle={styles.buttonContent}
            icon={({size, color}) => (
              <Icon source="chevron-down" size={size} color={color} />
            )}>
            {PROVIDER_LABELS[webSearchProvider]}
          </Button>
          <Menu
            visible={showProviderMenu}
            onDismiss={() => setShowProviderMenu(false)}
            anchor={providerAnchor}
            selectable>
            {(Object.keys(PROVIDER_LABELS) as WebSearchProvider[]).map(
              provider => (
                <Menu.Item
                  key={provider}
                  testID={`web-search-provider-option-${provider}`}
                  style={styles.menu}
                  label={PROVIDER_LABELS[provider]}
                  selected={provider === webSearchProvider}
                  onPress={() => handleProviderSelect(provider)}
                />
              ),
            )}
          </Menu>
        </View>
      </View>

      {webSearchProvider === 'searxng' && (
        <>
          <Text variant="titleMedium" style={styles.textLabel}>
            SearXNG Instance URL
          </Text>
          <TextInput
            testID="web-search-url-input"
            style={styles.textInput}
            value={webSearchUrl}
            onChangeText={handleWebSearchUrlChange}
            placeholder="https://your-searxng-instance.com"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text variant="labelSmall" style={styles.textDescription}>
            Enter your self-hosted SearXNG URL to let the model search the
            web. Leave empty to disable web search.
          </Text>
        </>
      )}

      {webSearchProvider === 'google_cse' && (
        <>
          <Text variant="titleMedium" style={styles.textLabel}>
            Google API Key
          </Text>
          <TextInput
            testID="web-search-google-api-key-input"
            style={styles.textInput}
            value={webSearchApiKey}
            onChangeText={handleWebSearchApiKeyChange}
            placeholder="Google API key"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
          <Text variant="titleMedium" style={styles.textLabel}>
            Search Engine ID (cx)
          </Text>
          <TextInput
            testID="web-search-cse-id-input"
            style={styles.textInput}
            value={googleCseId}
            onChangeText={handleGoogleCseIdChange}
            placeholder="e.g. 017576662512468239146:omuauf_lfve"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text variant="labelSmall" style={styles.textDescription}>
            Requires a Google Programmable Search Engine (create one at
            programmablesearchengine.google.com) plus an API key from Google
            Cloud Console. Key is stored encrypted on-device.
          </Text>
        </>
      )}

      {KEY_BASED_PROVIDERS.includes(webSearchProvider) &&
        webSearchProvider !== 'google_cse' && (
          <>
            <Text variant="titleMedium" style={styles.textLabel}>
              {PROVIDER_LABELS[webSearchProvider]} API Key
            </Text>
            <TextInput
              testID="web-search-api-key-input"
              style={styles.textInput}
              value={webSearchApiKey}
              onChangeText={handleWebSearchApiKeyChange}
              placeholder="API key"
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />
            <Text variant="labelSmall" style={styles.textDescription}>
              Stored encrypted on-device via the Android keystore. Leave
              empty to disable web search.
            </Text>
          </>
        )}
    </View>
  </Card.Content>
</Card>

          {/* Local Documents Settings */}
          <Card elevation={0} style={styles.card}>
            <Card.Title title="Local Documents" />
            <Card.Content>
              <Text variant="labelSmall" style={styles.textDescription}>
                Paste in notes or document text to let the model search them
                during chat. Requires a locally-loaded model (used to
                generate embeddings).
              </Text>

              <View style={styles.settingItemContainer}>
                <Text variant="titleMedium" style={styles.textLabel}>
                  Title
                </Text>
                <TextInput
                  testID="local-doc-title-input"
                  style={styles.textInput}
                  value={newDocTitle}
                  onChangeText={setNewDocTitle}
                  placeholder="e.g. Project Notes"
                  autoCapitalize="none"
                />
                <Text variant="titleMedium" style={styles.textLabel}>
                  Content
                </Text>
                <TextInput
                  testID="local-doc-content-input"
                  style={[styles.textInput, {minHeight: 100}]}
                  value={newDocText}
                  onChangeText={setNewDocText}
                  placeholder="Paste document text here..."
                  multiline
                />
                {docError && (
                  <Text
                    variant="labelSmall"
                    style={[styles.textDescription, {color: 'red'}]}>
                    {docError}
                  </Text>
                )}
                <Button
                  testID="local-doc-add-button"
                  mode="contained"
                  onPress={handleAddDocument}
                  loading={isIndexingDoc}
                  disabled={
                    isIndexingDoc ||
                    !newDocTitle.trim() ||
                    !newDocText.trim()
                  }
                  style={{marginTop: 8}}>
                  Add Document
                </Button>
              </View>

              {localDocs.length > 0 && (
                <View style={{marginTop: 16}}>
                  {localDocs.map(doc => (
                    <View
                      key={doc.title}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}>
                      <Text variant="bodyMedium">
                        {doc.title} ({doc.chunkCount} chunk
                        {doc.chunkCount === 1 ? '' : 's'})
                      </Text>
                      <IconButton
                        icon="delete"
                        size={20}
                        onPress={() => handleDeleteDocument(doc.title)}
                      />
                    </View>
                  ))}
                </View>
              )}
            </Card.Content>
          </Card>

          {/* Memory Settings */}
          <Card elevation={0} style={styles.card}>
            <Card.Title title={l10n.settings.memorySettings} />
            <Card.Content>
              <View style={styles.settingItemContainer}>
                {/* Use Memory Lock */}
                <View style={styles.switchContainer}>
                  <View style={styles.textContainer}>
                    <Text variant="titleMedium" style={styles.textLabel}>
                      {l10n.settings.useMlock}
                    </Text>
                    <Text variant="labelSmall" style={styles.textDescription}>
                      {l10n.settings.useMlockDescription}
                    </Text>
                  </View>
                  <Switch
                    testID="use-mlock-switch"
                    value={modelStore.contextInitParams.use_mlock}
                    onValueChange={value => modelStore.setUseMlock(value)}
                  />
                </View>
              </View>
              <Divider />

              {/* Memory Mapping */}
              <View style={styles.settingItemContainer}>
                <View style={styles.switchContainer}>
                  <View style={styles.textContainer}>
                    <Text variant="titleMedium" style={styles.textLabel}>
                      {l10n.settings.useMmap}
                    </Text>
                    <Text variant="labelSmall" style={styles.textDescription}>
                      {l10n.settings.useMmapDescription}
                    </Text>
                  </View>
                  <Switch
                    testID="use-mmap-switch"
                    value={
                      modelStore.contextInitParams.use_mmap !== 'false' &&
                      modelStore.contextInitParams.use_mmap !== 'smart'
                    }
                    onValueChange={value =>
                      modelStore.setUseMmap(value ? 'true' : 'false')
                    }
                  />
                </View>
              </View>
              <Divider />

              {/* Enable Weight Repacking (Android only) */}
              {Platform.OS === 'android' && (
                <View style={styles.settingItemContainer}>
                  <View style={styles.switchContainer}>
                    <View style={styles.textContainer}>
                      <Text variant="titleMedium" style={styles.textLabel}>
                        {l10n.settings.weightRepacking}
                      </Text>
                      <Text variant="labelSmall" style={styles.textDescription}>
                        {l10n.settings.weightRepackingDescription}
                      </Text>
                    </View>
                    <Switch
                      testID="weight-repacking-switch"
                      value={
                        !(modelStore.contextInitParams.no_extra_bufts ?? false)
                      }
                      onValueChange={value =>
                        modelStore.setNoExtraBufts(!value)
                      }
                    />
                  </View>
                </View>
              )}
              {Platform.OS === 'android' && <Divider />}

              <Text variant="labelSmall" style={styles.textDescription}>
                {l10n.settings.modelReloadNotice}
              </Text>
            </Card.Content>
          </Card>

          {/* Model Loading Settings */}
          <Card elevation={0} style={styles.card}>
            <Card.Title title={l10n.settings.modelLoadingSettings} />
            <Card.Content>
              <View style={styles.settingItemContainer}>
                {/* Auto Offload/Load */}
                <View style={styles.switchContainer}>
                  <View style={styles.textContainer}>
                    <Text variant="titleMedium" style={styles.textLabel}>
                      {l10n.settings.autoOffloadLoad}
                    </Text>
                    <Text variant="labelSmall" style={styles.textDescription}>
                      {l10n.settings.autoOffloadLoadDescription}
                    </Text>
                  </View>
                  <Switch
                    testID="auto-offload-load-switch"
                    value={modelStore.useAutoRelease}
                    onValueChange={value =>
                      modelStore.updateUseAutoRelease(value)
                    }
                  />
                </View>
                <Divider />

                {/* Auto Navigate to Chat */}
                <View style={styles.switchContainer}>
                  <View style={styles.textContainer}>
                    <Text variant="titleMedium" style={styles.textLabel}>
                      {l10n.settings.autoNavigateToChat}
                    </Text>
                    <Text variant="labelSmall" style={styles.textDescription}>
                      {l10n.settings.autoNavigateToChatDescription}
                    </Text>
                  </View>
                  <Switch
                    testID="auto-navigate-to-chat-switch"
                    value={uiStore.autoNavigatetoChat}
                    onValueChange={value =>
                      uiStore.setAutoNavigateToChat(value)
                    }
                  />
                </View>
              </View>
            </Card.Content>
          </Card>

          {/* UI Settings */}
          <Card elevation={0} style={styles.card}>
            <Card.Title title={l10n.settings.appSettings} />
            <Card.Content>
              <View style={styles.settingItemContainer}>
                {/* Language Selection */}
                <View style={styles.switchContainer}>
                  <View style={styles.textContainer}>
                    <View style={styles.labelWithIconContainer}>
                      <GlobeIcon
                        width={20}
                        height={20}
                        style={styles.settingIcon}
                        stroke={theme.colors.onSurface}
                      />
                      <Text variant="titleMedium" style={styles.textLabel}>
                        {l10n.settings.language}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.menuContainer}>
                    <Button
                      ref={languageButtonRef}
                      testID="language-selector-button"
                      mode="outlined"
                      onPress={handleLanguagePress}
                      style={styles.menuButton}
                      contentStyle={styles.buttonContent}
                      icon={({size, color}) => (
                        <Icon source="chevron-down" size={size} color={color} />
                      )}>
                      {languageDisplayNames[uiStore.language]}
                    </Button>
                    <Menu
                      visible={showLanguageMenu}
                      onDismiss={() => setShowLanguageMenu(false)}
                      anchor={languageAnchor}
                      selectable>
                      {uiStore.supportedLanguages.map(lang => (
                        <Menu.Item
                          key={lang}
                          testID={`language-option-${lang}`}
                          style={styles.menu}
                          label={languageDisplayNames[lang]}
                          selected={lang === uiStore.language}
                          onPress={() => {
                            uiStore.setLanguage(lang);
                            setShowLanguageMenu(false);
                          }}
                        />
                      ))}
                    </Menu>
                  </View>
                </View>
                <Divider />

                {/* Dark Mode */}
                <View style={styles.switchContainer}>
                  <View style={styles.textContainer}>
                    <View style={styles.labelWithIconContainer}>
                      <MoonIcon
                        width={20}
                        height={20}
                        style={styles.settingIcon}
                        stroke={theme.colors.onSurface}
                      />
                      <Text variant="titleMedium" style={styles.textLabel}>
                        {l10n.settings.darkMode}
                      </Text>
                    </View>
                  </View>
                  <Switch
                    testID="dark-mode-switch"
                    value={uiStore.colorScheme === 'dark'}
                    onValueChange={value =>
                      uiStore.setColorScheme(value ? 'dark' : 'light')
                    }
                  />
                </View>
                <Divider />

                {/* Text-to-speech availability toggle */}
                <View style={styles.switchContainer}>
                  <View style={styles.textContainer}>
                    <View style={styles.labelWithIconContainer}>
                      <VolumeOnIcon
                        width={20}
                        height={20}
                        style={styles.settingIcon}
                        stroke={theme.colors.onSurface}
                      />
                      <Text variant="titleMedium" style={styles.textLabel}>
                        {l10n.settings.ttsAvailability}
                      </Text>
                    </View>
                    <Text variant="labelSmall" style={styles.textDescription}>
                      {l10n.settings.ttsAvailabilityDescription}
                    </Text>
                    {!ttsStore.deviceMeetsMemory && (
                      <Text variant="labelSmall" style={styles.textDescription}>
                        {l10n.settings.ttsAvailabilityLowMemoryWarning}
                      </Text>
                    )}
                  </View>
                  <Switch
                    testID="tts-availability-switch"
                    value={
                      ttsStore.userTTSOverride ?? ttsStore.deviceMeetsMemory
                    }
                    onValueChange={value => ttsStore.setUserTTSOverride(value)}
                  />
                </View>

                {/* Display Memory Usage (iOS only) */}
                {Platform.OS === 'ios' && (
                  <>
                    <Divider />
                    <View style={styles.switchContainer}>
                      <View style={styles.textContainer}>
                        <View style={styles.labelWithIconContainer}>
                          <CpuChipIcon
                            width={20}
                            height={20}
                            style={styles.settingIcon}
                            stroke={theme.colors.onSurface}
                          />
                          <Text variant="titleMedium" style={styles.textLabel}>
                            {l10n.settings.displayMemoryUsage}
                          </Text>
                        </View>
                        <Text
                          variant="labelSmall"
                          style={styles.textDescription}>
                          {l10n.settings.displayMemoryUsageDescription}
                        </Text>
                      </View>
                      <Switch
                        testID="display-memory-usage-switch"
                        value={uiStore.displayMemUsage}
                        onValueChange={value =>
                          uiStore.setDisplayMemUsage(value)
                        }
                      />
                    </View>
                  </>
                )}
              </View>
            </Card.Content>
          </Card>

          {/* API Settings */}
          <Card elevation={0} style={styles.card}>
            <Card.Title title={l10n.settings.apiSettingsTitle} />
            <Card.Content>
              <View style={styles.settingItemContainer}>
                {/* Hugging Face Token */}
                <View style={styles.switchContainer}>
                  <View style={styles.textContainer}>
                    <Text variant="titleMedium" style={styles.textLabel}>
                      {l10n.settings.huggingFaceTokenLabel}
                    </Text>
                    <Text variant="labelSmall" style={styles.textDescription}>
                      {hfStore.isTokenPresent
                        ? l10n.settings.tokenIsSetDescription
                        : l10n.settings.setTokenDescription}
                    </Text>
                  </View>
                  <Button
                    mode="outlined"
                    onPress={() => setShowHfTokenDialog(true)}
                    style={styles.menuButton}>
                    {hfStore.isTokenPresent
                      ? l10n.common.update
                      : l10n.settings.setTokenButton}
                  </Button>
                </View>

                {/* Use HF Token Switch */}
                <Divider style={styles.divider} />
                <View style={styles.switchContainer}>
                  <View style={styles.textContainer}>
                    <Text variant="titleMedium" style={styles.textLabel}>
                      {l10n.settings.useHfTokenLabel}
                    </Text>
                    <Text variant="labelSmall" style={styles.textDescription}>
                      {l10n.settings.useHfTokenDescription}
                    </Text>
                  </View>
                  <Switch
                    testID="use-hf-token-switch"
                    value={hfStore.useHfToken}
                    disabled={!hfStore.isTokenPresent}
                    onValueChange={value => hfStore.setUseHfToken(value)}
                  />
                </View>
              </View>
            </Card.Content>
          </Card>

          {/* Cache & Storage Settings - iOS only (for Shortcuts) */}
          {Platform.OS === 'ios' && (
            <Card elevation={0} style={styles.card}>
              <Card.Title title={l10n.settings.cacheStorageTitle} />
              <Card.Content>
                <View style={styles.settingItemContainer}>
                  {/* Clear Shortcuts Caches */}
                  <View style={styles.switchContainer}>
                    <View style={styles.textContainer}>
                      <Text variant="titleMedium" style={styles.textLabel}>
                        {l10n.settings.clearPalCaches}
                      </Text>
                      <Text variant="labelSmall" style={styles.textDescription}>
                        {l10n.settings.clearPalCachesDescription}
                      </Text>
                    </View>
                    <Button
                      mode="outlined"
                      onPress={async () => {
                        try {
                          // Get cache info first
                          const cacheInfo = await getSessionCacheInfo();

                          if (cacheInfo.fileCount === 0) {
                            Alert.alert(
                              l10n.settings.clearPalCaches,
                              l10n.settings.noCachesToClear,
                            );
                            return;
                          }

                          // Show confirmation dialog with cache info
                          const formattedSize = formatBytes(
                            cacheInfo.totalSizeBytes,
                          );
                          const confirmMessage = t(
                            l10n.settings.clearCachesConfirmMessage,
                            {
                              fileCount: cacheInfo.fileCount.toString(),
                              size: formattedSize,
                            },
                          );

                          Alert.alert(
                            l10n.settings.clearCachesConfirmTitle,
                            confirmMessage,
                            [
                              {
                                text: l10n.common.cancel,
                                style: 'cancel',
                              },
                              {
                                text: l10n.settings.clearCachesButton,
                                style: 'destructive',
                                onPress: async () => {
                                  try {
                                    const deletedCount =
                                      await clearAllSessionCaches();
                                    const successMessage = t(
                                      l10n.settings.clearCachesSuccess,
                                      {count: deletedCount.toString()},
                                    );
                                    Alert.alert(
                                      l10n.settings.clearPalCaches,
                                      successMessage,
                                    );
                                  } catch (error) {
                                    console.error(
                                      'Failed to clear caches:',
                                      error,
                                    );
                                    Alert.alert(
                                      l10n.settings.clearPalCaches,
                                      l10n.settings.clearCachesError,
                                    );
                                  }
                                },
                              },
                            ],
                          );
                        } catch (error) {
                          console.error('Failed to get cache info:', error);
                          Alert.alert(
                            l10n.settings.clearPalCaches,
                            l10n.settings.clearCachesError,
                          );
                        }
                      }}
                      style={styles.menuButton}>
                      {l10n.settings.clearCachesButton}
                    </Button>
                  </View>
                </View>
              </Card.Content>
            </Card>
          )}

          {/* Export Options */}
          <Card elevation={0} style={styles.card}>
            <Card.Title title={l10n.settings.exportOptions} />
            <Card.Content>
              <View style={styles.settingItemContainer}>
                {/* Legacy Export */}
                <View style={styles.switchContainer}>
                  <View style={styles.textContainer}>
                    <View style={styles.labelWithIconContainer}>
                      <ShareIcon
                        width={20}
                        height={20}
                        style={styles.settingIcon}
                        stroke={theme.colors.onSurface}
                      />
                      <Text variant="titleMedium" style={styles.textLabel}>
                        {l10n.settings.exportLegacyChats}
                      </Text>
                    </View>
                    <Text variant="labelSmall" style={styles.textDescription}>
                      {l10n.settings.exportLegacyChatsDescription}
                    </Text>
                  </View>
                  <Button
                    mode="outlined"
                    onPress={async () => {
                      try {
                        await exportLegacyChatSessions();
                      } catch {
                        Alert.alert(
                          'Export Error',
                          'Failed to export legacy chat sessions. The file may not exist.',
                        );
                      }
                    }}
                    style={styles.menuButton}>
                    {l10n.settings.exportButton}
                  </Button>
                </View>
              </View>
            </Card.Content>
          </Card>
        </ScrollView>
      </TouchableWithoutFeedback>
      <HFTokenSheet
        isVisible={showHfTokenDialog}
        onDismiss={() => setShowHfTokenDialog(false)}
        onSave={() => setShowHfTokenDialog(false)}
      />
    </SafeAreaView>
  );
});
