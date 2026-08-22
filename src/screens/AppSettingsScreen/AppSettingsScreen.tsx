import React, {useContext, useRef, useState} from 'react';
import {View, Platform, ScrollView} from 'react-native';

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
import {
  Divider,
  LanguageSelector,
  Menu,
  InputSlider,
  SearchProviderKeySheet,
} from '../../components';

import {useTheme} from '../../hooks';

import {createStyles} from './styles';

import {uiStore, ttsStore, searchProviderStore} from '../../store';
import type {SearchProviderId} from '../../services/search/types';

import {t} from '../../locales';

import {L10nContext} from '../../utils';

export const AppSettingsScreen: React.FC = observer(() => {
  const l10n = useContext(L10nContext);
  const theme = useTheme();
  const styles = createStyles(theme);
  const [showSearchProviderMenu, setShowSearchProviderMenu] = useState(false);
  const [searchProviderAnchor, setSearchProviderAnchor] = useState<{
    x: number;
    y: number;
  }>({x: 0, y: 0});
  const [showSearchKeySheet, setShowSearchKeySheet] = useState(false);
  const searchProviderButtonRef = useRef<View>(null);

  const handleSearchProviderPress = () => {
    searchProviderButtonRef.current?.measure(
      (x, y, width, height, pageX, pageY) => {
        setSearchProviderAnchor({x: pageX, y: pageY + height});
        setShowSearchProviderMenu(true);
      },
    );
  };

  const activeSearchProvider = searchProviderStore.providers.find(
    provider => provider.id === searchProviderStore.activeProviderId,
  );
  const activeSearchProviderId = searchProviderStore.activeProviderId;
  const searchHasConsent = searchProviderStore.hasConsentedToSearch;

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.container}>
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
              <LanguageSelector />
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

        {/* Internet Search */}
        <View style={styles.group} testID="internet-search-card">
          <View style={styles.settingItemContainer}>
            <Text variant="labelSmall" style={styles.textDescription}>
              {l10n.settings.internetSearch.description}
            </Text>

            {/* First-enable consent gate / revoke affordance */}
            {!searchHasConsent ? (
              <View
                testID="internet-search-consent"
                style={styles.consentContainer}>
                <Text variant="titleMedium" style={styles.textLabel}>
                  {l10n.settings.internetSearch.consentTitle}
                </Text>
                <Text variant="labelSmall" style={styles.textDescription}>
                  {l10n.settings.internetSearch.consentDescription}
                </Text>
                <Button
                  testID="internet-search-consent-accept"
                  mode="contained"
                  onPress={() => searchProviderStore.setConsent(true)}
                  style={styles.consentButton}>
                  {l10n.settings.internetSearch.consentAccept}
                </Button>
              </View>
            ) : (
              <View
                testID="internet-search-consent-given"
                style={styles.consentContainer}>
                <Text variant="titleMedium" style={styles.textLabel}>
                  {l10n.settings.internetSearch.consentGivenTitle}
                </Text>
                <Text variant="labelSmall" style={styles.textDescription}>
                  {l10n.settings.internetSearch.consentGivenDescription}
                </Text>
                <Button
                  testID="internet-search-consent-revoke"
                  mode="outlined"
                  onPress={() => searchProviderStore.setConsent(false)}
                  style={styles.consentButton}>
                  {l10n.settings.internetSearch.consentRevoke}
                </Button>
              </View>
            )}
          </View>
          <Divider />

          {/* Provider picker */}
          <View style={styles.settingItemContainer}>
            <View style={styles.row}>
              <View style={styles.textContainer}>
                <Text variant="titleMedium" style={styles.textLabel}>
                  {l10n.settings.internetSearch.providerLabel}
                </Text>
              </View>
              <View style={styles.menuContainer}>
                <Button
                  ref={searchProviderButtonRef}
                  testID="search-provider-selector-button"
                  mode="outlined"
                  onPress={handleSearchProviderPress}
                  style={styles.menuButton}
                  contentStyle={styles.buttonContent}
                  icon={({size, color}) => (
                    <Icon source="chevron-down" size={size} color={color} />
                  )}>
                  {activeSearchProvider?.label ?? activeSearchProviderId}
                </Button>
                <Menu
                  visible={showSearchProviderMenu}
                  onDismiss={() => setShowSearchProviderMenu(false)}
                  anchor={searchProviderAnchor}
                  selectable>
                  {searchProviderStore.providers.map(provider => (
                    <Menu.Item
                      key={provider.id}
                      testID={`search-provider-option-${provider.id}`}
                      disabled={!provider.selectable}
                      style={styles.menu}
                      label={
                        provider.selectable
                          ? provider.label
                          : `${provider.label} (${l10n.settings.internetSearch.providerGated})`
                      }
                      selected={provider.id === activeSearchProviderId}
                      onPress={() => {
                        searchProviderStore.setActiveProvider(
                          provider.id as SearchProviderId,
                        );
                        setShowSearchProviderMenu(false);
                      }}
                    />
                  ))}
                </Menu>
              </View>
            </View>
          </View>
          <Divider />

          {/* Per-provider BYOK key entry */}
          <View style={styles.settingItemContainer}>
            <View style={styles.row}>
              <View style={styles.textContainer}>
                <Text variant="titleMedium" style={styles.textLabel}>
                  {l10n.settings.internetSearch.keyLabel}
                </Text>
                <Text variant="labelSmall" style={styles.textDescription}>
                  {searchProviderStore.hasKey(activeSearchProviderId)
                    ? t(l10n.settings.internetSearch.keyIsSet, {
                        provider:
                          activeSearchProvider?.label ?? activeSearchProviderId,
                      })
                    : t(l10n.settings.internetSearch.keyNotSet, {
                        provider:
                          activeSearchProvider?.label ?? activeSearchProviderId,
                      })}
                </Text>
                {!searchHasConsent && (
                  <Text variant="labelSmall" style={styles.textDescription}>
                    {l10n.settings.internetSearch.consentRequired}
                  </Text>
                )}
              </View>
              <Button
                testID="search-provider-key-button"
                mode="outlined"
                disabled={!searchHasConsent}
                onPress={() => setShowSearchKeySheet(true)}
                style={styles.menuButton}>
                {searchProviderStore.hasKey(activeSearchProviderId)
                  ? l10n.settings.internetSearch.updateKeyButton
                  : l10n.settings.internetSearch.setKeyButton}
              </Button>
            </View>
          </View>
          <Divider />

          {/* Result-count control */}
          <View style={styles.settingItemContainer}>
            <Text variant="titleMedium" style={styles.textLabel}>
              {l10n.settings.internetSearch.resultCountLabel}
            </Text>
            <InputSlider
              testID="search-result-count-slider"
              accessibilityLabel={l10n.settings.internetSearch.resultCountLabel}
              value={searchProviderStore.resultCount}
              onValueChange={value =>
                searchProviderStore.setResultCount(Math.round(value))
              }
              min={1}
              max={8}
              step={1}
            />
            <Text variant="labelSmall" style={styles.textDescription}>
              {l10n.settings.internetSearch.resultCountDescription}
            </Text>
          </View>
        </View>
      </ScrollView>
      <SearchProviderKeySheet
        isVisible={showSearchKeySheet}
        providerId={activeSearchProviderId}
        providerLabel={activeSearchProvider?.label ?? activeSearchProviderId}
        onDismiss={() => setShowSearchKeySheet(false)}
      />
    </SafeAreaView>
  );
});
