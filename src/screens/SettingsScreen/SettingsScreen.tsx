import React, {useState, useEffect, useRef, useContext} from 'react';
import {
  View,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  ScrollView,
  TextInput as RNTextInput,
  Alert,
} from 'react-native';

import {debounce} from 'lodash';
import {observer} from 'mobx-react-lite';
import Slider from '@react-native-community/slider';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Switch, Text, Card, Button, Icon, List} from 'react-native-paper';

import {GlobeIcon, MoonIcon, CpuChipIcon, ShareIcon} from '../../assets/icons';
import {TextInput, Menu, Divider, HFTokenSheet} from '../../components';

import {useTheme} from '../../hooks';

import {createStyles} from './styles';

import {modelStore, uiStore, hfStore} from '../../store';
import {AvailableLanguage} from '../../store/UIStore';

import {L10nContext} from '../../utils';
import {CacheType} from '../../utils/types';
import {exportLegacyChatSessions} from '../../utils/exportUtils';

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

export const SettingsScreen: React.FC = observer(() => {
  const l10n = useContext(L10nContext);
  const theme = useTheme();
  const styles = createStyles(theme);
  const [contextSize, setContextSize] = useState(
    modelStore.n_context.toString(),
  );
  const [isValidInput, setIsValidInput] = useState(true);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const inputRef = useRef<RNTextInput>(null);
  const [showKeyCacheMenu, setShowKeyCacheMenu] = useState(false);
  const [showValueCacheMenu, setShowValueCacheMenu] = useState(false);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const [showMmapMenu, setShowMmapMenu] = useState(false);
  const [showHfTokenDialog, setShowHfTokenDialog] = useState(false);
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
    setContextSize(modelStore.n_context.toString());
  }, []);

  useEffect(() => {
    return () => {
      debouncedUpdateStore.cancel();
    };
  }, [debouncedUpdateStore]);

  const handleOutsidePress = () => {
    Keyboard.dismiss();
    inputRef.current?.blur();
    setContextSize(modelStore.n_context.toString());
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

  const cacheTypeOptions = [
    {label: 'F32', value: CacheType.F32},
    {label: 'F16', value: CacheType.F16},
    {label: 'Q8_0', value: CacheType.Q8_0},
    {label: 'Q5_1', value: CacheType.Q5_1},
    {label: 'Q5_0', value: CacheType.Q5_0},
    {label: 'Q4_1', value: CacheType.Q4_1},
    {label: 'Q4_0', value: CacheType.Q4_0},
    {label: 'IQ4_NL', value: CacheType.IQ4_NL},
  ];

  const mmapOptions = [
    {label: l10n.settings.useMmapTrue, value: 'true' as const},
    {label: l10n.settings.useMmapFalse, value: 'false' as const},
    ...(Platform.OS === 'android'
      ? [{label: l10n.settings.useMmapSmart, value: 'smart' as const}]
      : []),
  ];

  const getCacheTypeLabel = (value: CacheType) => {
    return (
      cacheTypeOptions.find(option => option.value === value)?.label || value
    );
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

  const isIOS18OrHigher =
    Platform.OS === 'ios' && parseInt(Platform.Version as string, 10) >= 18;

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <TouchableWithoutFeedback onPress={handleOutsidePress}>
        <ScrollView contentContainerStyle={styles.container}>
          {/* Model Initialization Settings */}
          <Card elevation={0} style={styles.card}>
            <Card.Title title={l10n.settings.modelInitializationSettings} />
            <Card.Content>
              {/* Metal Settings (iOS only) */}
              {Platform.OS === 'ios' && (
                <>
                  <View style={styles.settingItemContainer}>
                    <View style={styles.switchContainer}>
                      <View style={styles.textContainer}>
                        <Text variant="titleMedium" style={styles.textLabel}>
                          {l10n.settings.metal}
                        </Text>
                        <Text
                          variant="labelSmall"
                          style={styles.textDescription}>
                          {isIOS18OrHigher
                            ? l10n.settings.metalDescription
                            : l10n.settings.metalRequiresNewerIOS}
                        </Text>
                      </View>
                      <Switch
                        testID="metal-switch"
                        value={modelStore.useMetal}
                        onValueChange={value =>
                          modelStore.updateUseMetal(value)
                        }
                        // disabled={!isIOS18OrHigher}
                        // We don't disable for cases where the users has has set to true in the past.
                      />
                    </View>
                    <Slider
                      testID="gpu-layers-slider"
                      disabled={!modelStore.useMetal}
                      value={modelStore.n_gpu_layers}
                      onValueChange={value =>
                        modelStore.setNGPULayers(Math.round(value))
                      }
                      minimumValue={1}
                      maximumValue={100}
                      step={1}
                      style={styles.slider}
                      thumbTintColor={theme.colors.primary}
                      minimumTrackTintColor={theme.colors.primary}
                    />
                    <Text variant="labelSmall" style={styles.textDescription}>
                      {l10n.settings.layersOnGPU.replace(
                        '{{gpuLayers}}',
                        modelStore.n_gpu_layers.toString(),
                      )}
                    </Text>
                  </View>
                  <Divider />
                </>
              )}

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
                    <Text variant="titleMedium" style={styles.textLabel}>
                      {l10n.settings.batchSize}
                    </Text>
                    <Slider
                      testID="batch-size-slider"
                      value={modelStore.n_batch}
                      onValueChange={value =>
                        modelStore.setNBatch(Math.round(value))
                      }
                      minimumValue={1}
                      maximumValue={4096}
                      step={1}
                      style={styles.slider}
                      thumbTintColor={theme.colors.primary}
                      minimumTrackTintColor={theme.colors.primary}
                    />
                    <Text variant="labelSmall" style={styles.textDescription}>
                      {l10n.settings.batchSizeDescription
                        .replace('{{batchSize}}', modelStore.n_batch.toString())
                        .replace(
                          '{{effectiveBatch}}',
                          modelStore.n_batch > modelStore.n_context
                            ? ` (${l10n.settings.effectiveLabel}: ${modelStore.n_context})`
                            : '',
                        )}
                    </Text>
                  </View>
                  <Divider />

                  {/* Physical Batch Size Slider */}
                  <View style={styles.settingItemContainer}>
                    <Text variant="titleMedium" style={styles.textLabel}>
                      {l10n.settings.physicalBatchSize}
                    </Text>
                    <Slider
                      testID="ubatch-size-slider"
                      value={modelStore.n_ubatch}
                      onValueChange={value =>
                        modelStore.setNUBatch(Math.round(value))
                      }
                      minimumValue={1}
                      maximumValue={4096}
                      step={1}
                      style={styles.slider}
                      thumbTintColor={theme.colors.primary}
                      minimumTrackTintColor={theme.colors.primary}
                    />
                    <Text variant="labelSmall" style={styles.textDescription}>
                      {l10n.settings.physicalBatchSizeDescription
                        .replace(
                          '{{physicalBatchSize}}',
                          modelStore.n_ubatch.toString(),
                        )
                        .replace(
                          '{{effectivePhysicalBatch}}',
                          modelStore.n_ubatch >
                            Math.min(modelStore.n_batch, modelStore.n_context)
                            ? ` (${l10n.settings.effectiveLabel}: ${Math.min(
                                modelStore.n_batch,
                                modelStore.n_context,
                              )})`
                            : '',
                        )}
                    </Text>
                  </View>
                  <Divider />

                  {/* Thread Count Slider */}
                  <View style={styles.settingItemContainer}>
                    <Text variant="titleMedium" style={styles.textLabel}>
                      {l10n.settings.cpuThreads}
                    </Text>
                    <Slider
                      testID="thread-count-slider"
                      value={modelStore.n_threads}
                      onValueChange={value =>
                        modelStore.setNThreads(Math.round(value))
                      }
                      minimumValue={1}
                      maximumValue={modelStore.max_threads}
                      step={1}
                      style={styles.slider}
                      thumbTintColor={theme.colors.primary}
                      minimumTrackTintColor={theme.colors.primary}
                    />
                    <Text variant="labelSmall" style={styles.textDescription}>
                      {l10n.settings.cpuThreadsDescription
                        .replace('{{threads}}', modelStore.n_threads.toString())
                        .replace(
                          '{{maxThreads}}',
                          modelStore.max_threads.toString(),
                        )}
                    </Text>
                  </View>
                  <Divider />

                  {/* Flash Attention and Cache Types */}
                  <View style={styles.settingItemContainer}>
                    <View style={styles.switchContainer}>
                      <View style={styles.textContainer}>
                        <Text variant="titleMedium" style={styles.textLabel}>
                          {l10n.settings.flashAttention}
                        </Text>
                        <Text
                          variant="labelSmall"
                          style={styles.textDescription}>
                          {l10n.settings.flashAttentionDescription}
                        </Text>
                      </View>
                      <Switch
                        testID="flash-attention-switch"
                        value={modelStore.flash_attn}
                        onValueChange={value => modelStore.setFlashAttn(value)}
                      />
                    </View>
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
                          {modelStore.flash_attn
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
                          disabled={!modelStore.flash_attn}
                          icon={({size, color}) => (
                            <Icon
                              source="chevron-down"
                              size={size}
                              color={color}
                            />
                          )}>
                          {getCacheTypeLabel(modelStore.cache_type_k)}
                        </Button>
                        <Menu
                          visible={showKeyCacheMenu}
                          onDismiss={() => setShowKeyCacheMenu(false)}
                          anchor={keyCacheAnchor}
                          selectable>
                          {cacheTypeOptions.map(option => (
                            <Menu.Item
                              key={option.value}
                              style={styles.menu}
                              label={option.label}
                              selected={
                                option.value === modelStore.cache_type_k
                              }
                              onPress={() => {
                                modelStore.setCacheTypeK(option.value);
                                setShowKeyCacheMenu(false);
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
                          {modelStore.flash_attn
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
                          disabled={!modelStore.flash_attn}
                          icon={({size, color}) => (
                            <Icon
                              source="chevron-down"
                              size={size}
                              color={color}
                            />
                          )}>
                          {getCacheTypeLabel(modelStore.cache_type_v)}
                        </Button>
                        <Menu
                          visible={showValueCacheMenu}
                          onDismiss={() => setShowValueCacheMenu(false)}
                          anchor={valueCacheAnchor}
                          selectable>
                          {cacheTypeOptions.map(option => (
                            <Menu.Item
                              key={option.value}
                              label={option.label}
                              style={styles.menu}
                              selected={
                                option.value === modelStore.cache_type_v
                              }
                              onPress={() => {
                                modelStore.setCacheTypeV(option.value);
                                setShowValueCacheMenu(false);
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
                    value={modelStore.use_mlock}
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
                      {getMmapLabel(modelStore.use_mmap)}
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
                          selected={option.value === modelStore.use_mmap}
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
