import React, {useState, useEffect, useRef, useContext} from 'react';
import {
  View,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  ScrollView,
  TextInput as RNTextInput,
} from 'react-native';

import {debounce} from 'lodash';
import {observer} from 'mobx-react-lite';
import Slider from '@react-native-community/slider';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Switch, Text, Card, Button, Icon, List} from 'react-native-paper';

import {TextInput, Menu, Divider} from '../../components';

import {useTheme} from '../../hooks';

import {createStyles} from './styles';

import {modelStore, uiStore} from '../../store';

import {L10nContext} from '../../utils';
import {CacheType} from '../../utils/types';

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
  const [keyCacheAnchor, setKeyCacheAnchor] = useState<{x: number; y: number}>({
    x: 0,
    y: 0,
  });
  const [valueCacheAnchor, setValueCacheAnchor] = useState<{
    x: number;
    y: number;
  }>({x: 0, y: 0});
  const keyCacheButtonRef = useRef<View>(null);
  const valueCacheButtonRef = useRef<View>(null);

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

  const getCacheTypeLabel = (value: CacheType) => {
    return (
      cacheTypeOptions.find(option => option.value === value)?.label || value
    );
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

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <TouchableWithoutFeedback onPress={handleOutsidePress}>
        <ScrollView contentContainerStyle={styles.container}>
          {/* Model Initialization Settings */}
          <Card elevation={0} style={styles.card}>
            <Card.Title title="Model Initialization Settings" />
            <Card.Content>
              {/* Metal Settings (iOS only) */}
              {Platform.OS === 'ios' && (
                <>
                  <View style={styles.settingItemContainer}>
                    <View style={styles.switchContainer}>
                      <View style={styles.textContainer}>
                        <Text variant="titleMedium" style={styles.textLabel}>
                          {l10n.metal}
                        </Text>
                        <Text
                          variant="labelSmall"
                          style={styles.textDescription}>
                          {l10n.metalDescription}
                        </Text>
                      </View>
                      <Switch
                        testID="metal-switch"
                        value={modelStore.useMetal}
                        onValueChange={value =>
                          modelStore.updateUseMetal(value)
                        }
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
                      {l10n.layersOnGPU.replace(
                        '{{gpuLayers}}',
                        modelStore.n_gpu_layers.toString(),
                      )}
                    </Text>
                  </View>
                </>
              )}
              <Divider />

              {/* Context Size */}
              <View style={styles.settingItemContainer}>
                <Text variant="titleMedium" style={styles.textLabel}>
                  {l10n.contextSize}
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
                  placeholder={l10n.contextSizePlaceholder.replace(
                    '{{minContextSize}}',
                    modelStore.MIN_CONTEXT_SIZE.toString(),
                  )}
                />
                {!isValidInput && (
                  <Text style={styles.errorText}>
                    {l10n.invalidContextSizeError.replace(
                      '{{minContextSize}}',
                      modelStore.MIN_CONTEXT_SIZE.toString(),
                    )}
                  </Text>
                )}
                <Text variant="labelSmall" style={styles.textDescription}>
                  {l10n.modelReloadNotice}
                </Text>
              </View>

              {/* Advanced Settings */}
              <List.Accordion
                title="Advanced Settings"
                titleStyle={styles.accordionTitle}
                style={styles.advancedAccordion}
                expanded={showAdvancedSettings}
                onPress={() => setShowAdvancedSettings(!showAdvancedSettings)}>
                <View style={styles.advancedSettingsContent}>
                  {/* Batch Size Slider */}
                  <View style={styles.settingItemContainer}>
                    <Text variant="titleMedium" style={styles.textLabel}>
                      Batch Size
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
                      {`Batch size: ${modelStore.n_batch}${
                        modelStore.n_batch > modelStore.n_context
                          ? ` (effective: ${modelStore.n_context})`
                          : ''
                      }`}
                    </Text>
                  </View>
                  <Divider />

                  {/* Physical Batch Size Slider */}
                  <View style={styles.settingItemContainer}>
                    <Text variant="titleMedium" style={styles.textLabel}>
                      Physical Batch Size
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
                      {`Physical batch size: ${modelStore.n_ubatch}${
                        modelStore.n_ubatch >
                        Math.min(modelStore.n_batch, modelStore.n_context)
                          ? ` (effective: ${Math.min(
                              modelStore.n_batch,
                              modelStore.n_context,
                            )})`
                          : ''
                      }`}
                    </Text>
                  </View>
                  <Divider />

                  {/* Thread Count Slider */}
                  <View style={styles.settingItemContainer}>
                    <Text variant="titleMedium" style={styles.textLabel}>
                      CPU Threads
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
                      {`Using ${modelStore.n_threads} of ${modelStore.max_threads} available threads`}
                    </Text>
                  </View>
                  <Divider />

                  {/* Flash Attention and Cache Types */}
                  <View style={styles.settingItemContainer}>
                    <View style={styles.switchContainer}>
                      <View style={styles.textContainer}>
                        <Text variant="titleMedium" style={styles.textLabel}>
                          Flash Attention
                        </Text>
                        <Text
                          variant="labelSmall"
                          style={styles.textDescription}>
                          Enable Flash Attention for faster processing
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
                          Key Cache Type
                        </Text>
                        <Text
                          variant="labelSmall"
                          style={styles.textDescription}>
                          {modelStore.flash_attn
                            ? 'Select the cache type for key computation'
                            : 'Enable Flash Attention to change cache type'}
                        </Text>
                      </View>
                      <View
                        style={styles.menuContainer}
                        ref={keyCacheButtonRef}>
                        <Button
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
                          Value Cache Type
                        </Text>
                        <Text
                          variant="labelSmall"
                          style={styles.textDescription}>
                          {modelStore.flash_attn
                            ? 'Select the cache type for value computation'
                            : 'Enable Flash Attention to change cache type'}
                        </Text>
                      </View>
                      <View
                        style={styles.menuContainer}
                        ref={valueCacheButtonRef}>
                        <Button
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

          {/* Model Loading Settings */}
          <Card elevation={0} style={styles.card}>
            <Card.Title title="Model Loading Settings" />
            <Card.Content>
              <View style={styles.settingItemContainer}>
                {/* Auto Offload/Load */}
                <View style={styles.switchContainer}>
                  <View style={styles.textContainer}>
                    <Text variant="titleMedium" style={styles.textLabel}>
                      {l10n.autoOffloadLoad}
                    </Text>
                    <Text variant="labelSmall" style={styles.textDescription}>
                      {l10n.autoOffloadLoadDescription}
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
                      {l10n.autoNavigateToChat}
                    </Text>
                    <Text variant="labelSmall" style={styles.textDescription}>
                      {l10n.autoNavigateToChatDescription}
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
            <Card.Title title="App Settings" />
            <Card.Content>
              <View style={styles.settingItemContainer}>
                {/* Dark Mode */}
                <View style={styles.switchContainer}>
                  <View style={styles.textContainer}>
                    <Text variant="titleMedium" style={styles.textLabel}>
                      Dark Mode
                    </Text>
                    <Text variant="labelSmall" style={styles.textDescription}>
                      Toggle dark mode on or off.
                    </Text>
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

                {/* iOS Background Download */}
                {Platform.OS === 'ios' && (
                  <View style={styles.switchContainer}>
                    <View style={styles.textContainer}>
                      <Text variant="titleMedium" style={styles.textLabel}>
                        {l10n.iOSBackgroundDownload}
                      </Text>
                      <Text variant="labelSmall" style={styles.textDescription}>
                        {l10n.iOSBackgroundDownloadDescription}
                      </Text>
                    </View>
                    <Switch
                      testID="ios-background-download-switch"
                      value={uiStore.iOSBackgroundDownloading}
                      onValueChange={value =>
                        uiStore.setiOSBackgroundDownloading(value)
                      }
                    />
                  </View>
                )}
                <Divider />

                {/* Display Memory Usage (iOS only) */}
                {Platform.OS === 'ios' && (
                  <View style={styles.switchContainer}>
                    <View style={styles.textContainer}>
                      <Text variant="titleMedium" style={styles.textLabel}>
                        {l10n.displayMemoryUsage}
                      </Text>
                      <Text variant="labelSmall" style={styles.textDescription}>
                        {l10n.displayMemoryUsageDescription}
                      </Text>
                    </View>
                    <Switch
                      testID="display-memory-usage-switch"
                      value={uiStore.displayMemUsage}
                      onValueChange={value => uiStore.setDisplayMemUsage(value)}
                    />
                  </View>
                )}
              </View>
            </Card.Content>
          </Card>
        </ScrollView>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
});
