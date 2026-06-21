import React, {useState, useRef, useContext} from 'react';
import {View, Platform} from 'react-native';

import {observer} from 'mobx-react-lite';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Text, Button, Icon} from 'react-native-paper';

import {
  GlobeIcon,
  MoonIcon,
  CpuChipIcon,
  VolumeOnIcon,
} from '../../assets/icons';

import {Switch} from '../../components/ui/Switch';
import {Menu, Divider} from '../../components';

import {useTheme} from '../../hooks';

import {createStyles} from './styles';

import {uiStore, ttsStore} from '../../store';
import {languageDisplayNames} from '../../locales';

import {L10nContext} from '../../utils';

export const AppSettingsScreen: React.FC = observer(() => {
  const l10n = useContext(L10nContext);
  const theme = useTheme();
  const styles = createStyles(theme);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const [languageAnchor, setLanguageAnchor] = useState<{x: number; y: number}>({
    x: 0.0,
    y: 0.0,
  });
  const languageButtonRef = useRef<View>(null);

  const handleLanguagePress = () => {
    languageButtonRef.current?.measure((x, y, width, height, pageX, pageY) => {
      setLanguageAnchor({x: pageX, y: pageY + height});
      setShowLanguageMenu(true);
    });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <View style={styles.container}>
        <View style={styles.group}>
          {/* Dark Mode */}
          <View style={styles.settingItemContainer}>
            <View style={styles.row}>
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
                accessibilityLabel={l10n.settings.darkMode}
                value={uiStore.colorScheme === 'dark'}
                onValueChange={value =>
                  uiStore.setColorScheme(value ? 'dark' : 'light')
                }
              />
            </View>
          </View>
          <Divider />

          {/* Language Selection */}
          <View style={styles.settingItemContainer}>
            <View style={styles.row}>
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
          </View>
          <Divider />

          {/* Text-to-speech availability toggle */}
          <View style={styles.settingItemContainer}>
            <View style={styles.row}>
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
                accessibilityLabel={l10n.settings.ttsAvailability}
                value={ttsStore.userTTSOverride ?? ttsStore.deviceMeetsMemory}
                onValueChange={value => ttsStore.setUserTTSOverride(value)}
              />
            </View>
          </View>

          {/* Display Memory Usage (iOS only) */}
          {Platform.OS === 'ios' && (
            <>
              <Divider />
              <View style={styles.settingItemContainer}>
                <View style={styles.row}>
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
                    <Text variant="labelSmall" style={styles.textDescription}>
                      {l10n.settings.displayMemoryUsageDescription}
                    </Text>
                  </View>
                  <Switch
                    testID="display-memory-usage-switch"
                    accessibilityLabel={l10n.settings.displayMemoryUsage}
                    value={uiStore.displayMemUsage}
                    onValueChange={value => uiStore.setDisplayMemUsage(value)}
                  />
                </View>
              </View>
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
});
