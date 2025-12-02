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
import {
  Switch,
  Text,
  Card,
  Button,
  Icon,
  List,
  SegmentedButtons,
} from 'react-native-paper';

import {
  GlobeIcon,
  MoonIcon,
  CpuChipIcon,
  ShareIcon,
  LinkExternalIcon,
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

import {AvailableLanguage} from '../../store/UIStore';
import {modelStore, uiStore, hfStore} from '../../store';

import {CacheType} from '../../utils/types';
import {
  L10nContext,
  formatBytes,
  clearAllSessionCaches,
  getSessionCacheInfo,
} from '../../utils';
import {checkGpuSupport} from '../../utils/deviceCapabilities';
import {exportLegacyChatSessions} from '../../utils/exportUtils';
import {getDeviceOptions, DeviceOption} from '../../utils/deviceSelection';
import {
  inferBackendType,
  getAllowedCacheTypeKOptions,
  getAllowedCacheTypeVOptions,
} from '../../utils/flashAttnCompatibility';

// Language display names in their native form
const languageNames: Record<AvailableLanguage, string> = {
  en: 'English (EN)',
  //es: 'Español (ES)',
  //de: 'Deutsch (DE)',
  ja: '日本語 (JA)',
  //ko: '한국어 (KO)',
  //pl: 'Polski (PL)',
  //pt: 'Português (PT)',
  //ru: 'Русский (RU)',
  //tr: 'Türkçe (TR)',
  //uk: 'Українська (UK)',
  //ca: 'Català (CA)',
  zh: '中文 (ZH)',
};

// OpenCL documentation URL (not localized)
const OPENCL_DOCS_URL =
  'https://github.com/ggml-org/llama.cpp/blob/master/docs/backend/OPENCL.md#model-preparation';

export const SettingsScreen: React.FC = observer(() => {
  const l10n = useContext(L10nContext);
  const theme = useTheme();
  const styles = createStyles(theme);
  const [contextSize, setContextSize] = useState(
    modelStore.contextInitParams.n_ctx.toString(),
  );
  const [isValidInput, setIsValidInput] = useState(true);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const inputRef = useRef<RNTextInput>(null);
  const [showKeyCacheMenu, setShowKeyCacheMenu] = useState(false);
  const [showValueCacheMenu, setShowValueCacheMenu] = useState(false);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const [showMmapMenu, setShowMmapMenu] = useState(false);
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
  const [mmapAnchor, setMmapAnchor] = useState<{x: number; y: number}>({
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
  const mmapButtonRef = useRef<View>(null);

  const debouncedUpdateStore = useRef(
    debounce((value: number) => {
      modelStore.setNContext(value);
    }, 500),
  ).current;

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
    setShowMmapMenu(false);
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

  const mmapOptions = [
    {label: l10n.settings.useMmapTrue, value: 'true' as const},
    {label: l10n.settings.useMmapFalse, value: 'false' as const},
    ...(Platform.OS === 'android'
      ? [{label: l10n.settings.useMmapSmart, value: 'smart' as const}]
      : []),
  ];

  const getCacheTypeLabel = (
    value: CacheType | string,
    isValueCache = false,
  ) => {
    const options = isValueCache ? cacheTypeVOptions : cacheTypeKOptions;
    return options.find(option => option.value === value)?.label || value;
  };

  const getMmapLabel = (value: 'true' | 'false' | 'smart') => {
    return mmapOptions.find(option => option.value === value)?.label || '';
  };

  const handleMmapPress = () => {
    mmapButtonRef.current?.measure((x, y, width, height, pageX, pageY) => {
      setMmapAnchor({x: pageX, y: pageY + height});
      setShowMmapMenu(true);
    });
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
      <TouchableWithoutFeedback onPress={handleOutsidePress}>
        <ScrollView contentContainerStyle={styles.container}>
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
                      {l10n.settings.layersOnGPU.replace(
                        '{{gpuLayers}}',
                        modelStore.contextInitParams.n_gpu_layers.toString(),
                      )}
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
                  placeholder={l10n.settings.contextSizePlaceholder.replace(
                    '{{minContextSize}}',
                    modelStore.MIN_CONTEXT_SIZE.toString(),
                  )}
                />
                {!isValidInput && (
                  <Text style={styles.errorText}>
                    {l10n.settings.invalidContextSizeError.replace(
                      '{{minContextSize}}',
                      modelStore.MIN_CONTEXT_SIZE.toString(),
                    )}
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
                      {l10n.settings.batchSizeDescription
                        .replace(
                          '{{batchSize}}',
                          modelStore.contextInitParams.n_batch.toString(),
                        )
                        .replace(
                          '{{effectiveBatch}}',
                          modelStore.contextInitParams.n_batch >
                            modelStore.contextInitParams.n_ctx
                            ? ` (${l10n.settings.effectiveLabel}: ${modelStore.contextInitParams.n_ctx})`
                            : '',
                        )}
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
                      {l10n.settings.physicalBatchSizeDescription
                        .replace(
                          '{{physicalBatchSize}}',
                          modelStore.contextInitParams.n_ubatch.toString(),
                        )
                        .replace(
                          '{{effectivePhysicalBatch}}',
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
                        )}
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
                      {l10n.settings.cpuThreadsDescription
                        .replace(
                          '{{threads}}',
                          modelStore.contextInitParams.n_threads.toString(),
                        )
                        .replace(
                          '{{maxThreads}}',
                          modelStore.max_threads.toString(),
                        )}
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
                  <View style={styles.menuContainer}>
                    <Button
                      ref={mmapButtonRef}
                      mode="outlined"
                      onPress={handleMmapPress}
                      style={styles.menuButton}
                      contentStyle={styles.buttonContent}
                      icon={({size, color}) => (
                        <Icon source="chevron-down" size={size} color={color} />
                      )}>
                      {getMmapLabel(modelStore.contextInitParams.use_mmap)}
                    </Button>
                    <Menu
                      visible={showMmapMenu}
                      onDismiss={() => setShowMmapMenu(false)}
                      anchor={mmapAnchor}
                      selectable>
                      {mmapOptions.map(option => (
                        <Menu.Item
                          key={option.value}
                          style={styles.menu}
                          label={option.label}
                          selected={
                            option.value ===
                            modelStore.contextInitParams.use_mmap
                          }
                          onPress={() => {
                            modelStore.setUseMmap(option.value);
                            setShowMmapMenu(false);
                          }}
                        />
                      ))}
                    </Menu>
                  </View>
                </View>
              </View>
              <Divider />

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
                      mode="outlined"
                      onPress={handleLanguagePress}
                      style={styles.menuButton}
                      contentStyle={styles.buttonContent}
                      icon={({size, color}) => (
                        <Icon source="chevron-down" size={size} color={color} />
                      )}>
                      {languageNames[uiStore.language]}
                    </Button>
                    <Menu
                      visible={showLanguageMenu}
                      onDismiss={() => setShowLanguageMenu(false)}
                      anchor={languageAnchor}
                      selectable>
                      {uiStore.supportedLanguages.map(lang => (
                        <Menu.Item
                          key={lang}
                          style={styles.menu}
                          label={languageNames[lang]}
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
                          const confirmMessage =
                            l10n.settings.clearCachesConfirmMessage
                              .replace(
                                '{{fileCount}}',
                                cacheInfo.fileCount.toString(),
                              )
                              .replace('{{size}}', formattedSize);

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
                                    const successMessage =
                                      l10n.settings.clearCachesSuccess.replace(
                                        '{{count}}',
                                        deletedCount.toString(),
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
                      } catch (error) {
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
