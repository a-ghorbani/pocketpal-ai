import React, {useContext, useState} from 'react';
import {Platform, View} from 'react-native';
import {Button, Text, TouchableRipple} from 'react-native-paper';
import {observer} from 'mobx-react';
import Speech from '@pocketpalai/react-native-speech';

import {
  ChevronDownIcon,
  ChevronRightIcon,
  CloudIcon,
  DownloadIcon,
  MicrophoneOffIcon,
  SettingsIcon,
} from '../../assets/icons';
import {useTheme} from '../../hooks';
import {t} from '../../locales';
import {
  cantoneseUnderZh,
  languageName,
  systemLanguageOptions,
  systemPhoneLocale,
  systemSections,
  systemShownLanguages,
} from '../../services/tts';
import type {
  SystemVoiceRow,
  SystemVoiceSection,
  Voice,
} from '../../services/tts';
import {ttsStore, uiStore} from '../../store';
import {L10nContext} from '../../utils';
import {SearchableSelectSheet} from '../SearchableSelectSheet';

import {createStyles} from './styles';

export type RenderSystemRow = (
  row: SystemVoiceRow,
  accessibilityLabel: string,
) => React.ReactNode;

type SystemVoiceGroupProps = {
  voices: Voice[];
  phoneLocale?: string;
  pickedLanguage: string | null;
  onPickLanguage: (language: string) => void;
  renderRow: RenderSystemRow;
};

const openVoiceInstaller = () => {
  Speech.openVoiceDataInstaller().catch(err => {
    console.warn('[SystemVoiceGroup] voice installer failed:', err);
  });
};

export const SystemVoiceGroup: React.FC<SystemVoiceGroupProps> = observer(
  ({voices, phoneLocale, pickedLanguage, onPickLanguage, renderRow}) => {
    const theme = useTheme();
    const l10n = useContext(L10nContext);
    const styles = createStyles(theme);
    const [languageSheetOpen, setLanguageSheetOpen] = useState(false);
    const copy = l10n.voiceAndSpeech;
    const muted = theme.colors.onSurfaceVariant;
    const isAndroid = Platform.OS === 'android';
    const underZh = cantoneseUnderZh(voices, isAndroid);
    const locale = systemPhoneLocale(phoneLocale, underZh);

    const languages = systemShownLanguages({
      phoneLocale: locale,
      appLanguage: uiStore.language,
      currentVoice: ttsStore.currentVoice,
      pickedLanguage,
      cantoneseUnderZh: underZh,
    });
    const shownLanguages = languages.map(languageName).join(', ');

    const getMoreVoicesRow = (testID: string) => (
      <TouchableRipple
        onPress={openVoiceInstaller}
        accessibilityRole="button"
        accessibilityLabel={copy.systemGetMoreVoices}
        testID={testID}>
        <View style={styles.systemAction}>
          <DownloadIcon width={18} height={18} stroke={theme.colors.primary} />
          <Text style={styles.systemActionLabel}>
            {copy.systemGetMoreVoices}
          </Text>
          <ChevronRightIcon width={16} height={16} stroke={muted} />
        </View>
      </TouchableRipple>
    );

    const renderSection = (section: SystemVoiceSection) => {
      const count = section.onDevice.length + section.network.length;
      const hasNetwork = section.network.length > 0;
      return (
        <View key={section.key}>
          <View
            style={styles.systemBand}
            testID={`tts-system-section-${section.key}`}>
            <Text style={styles.systemBandTitle}>{section.title}</Text>
            {count > 0 ? (
              <Text style={styles.systemBandCount}>{count}</Text>
            ) : null}
          </View>
          {count === 0 ? (
            <View style={styles.systemEmptyLanguage}>
              <Text style={styles.systemEmptyLanguageText}>
                {t(copy.systemNoVoicesForLanguage, {language: section.title})}
              </Text>
              {isAndroid ? (
                <Button
                  mode="text"
                  icon="download"
                  onPress={openVoiceInstaller}
                  accessibilityLabel={copy.systemGetMoreVoices}
                  testID={`tts-system-get-voices-${section.key}`}
                  contentStyle={styles.systemActionButton}>
                  {copy.systemGetMoreVoices}
                </Button>
              ) : null}
            </View>
          ) : null}
          {hasNetwork && section.onDevice.length > 0 ? (
            <View style={styles.systemSubHeader}>
              <Text style={styles.systemSubHeaderText}>
                {copy.systemOnDeviceSection}
              </Text>
            </View>
          ) : null}
          {section.onDevice.map(row => renderRow(row, row.label))}
          {hasNetwork ? (
            <View
              style={styles.systemSubHeader}
              testID={`tts-system-network-header-${section.key}`}>
              <CloudIcon width={13} height={13} stroke={muted} />
              <Text style={[styles.systemSubHeaderText, styles.systemIconGap]}>
                {copy.systemNeedsInternet}
              </Text>
            </View>
          ) : null}
          {section.network.map(row =>
            renderRow(row, `${row.label}, ${copy.systemNeedsInternet}`),
          )}
        </View>
      );
    };

    return (
      <>
        <View style={[styles.engineGroupBody, styles.systemHintRow]}>
          <MicrophoneOffIcon width={14} height={14} stroke={muted} />
          <Text style={[styles.engineGroupHintText, styles.systemHintText]}>
            {copy.systemVoiceModeHint}
          </Text>
        </View>
        {voices.length > 0 ? (
          <>
            <View style={styles.engineGroupBody}>
              <Text style={styles.systemFieldLabel}>
                {copy.systemLanguagesLabel}
              </Text>
              <TouchableRipple
                onPress={() => setLanguageSheetOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={`${copy.systemLanguagesLabel}: ${shownLanguages}`}
                testID="tts-system-language-button"
                style={styles.systemField}>
                <View style={styles.systemFieldInner}>
                  <Text style={styles.systemFieldText} numberOfLines={1}>
                    {shownLanguages}
                  </Text>
                  <ChevronDownIcon
                    width={18}
                    height={18}
                    stroke={theme.colors.onSurface}
                  />
                </View>
              </TouchableRipple>
            </View>
            {systemSections(voices, languages, locale).map(renderSection)}
          </>
        ) : (
          <View style={styles.engineGroupBody}>
            <Text style={styles.engineGroupEmpty}>{copy.voicesEmptyState}</Text>
          </View>
        )}
        <View style={styles.systemFooter}>
          {isAndroid ? (
            getMoreVoicesRow('tts-system-get-voices')
          ) : (
            <View style={[styles.engineGroupBody, styles.systemHintRow]}>
              <SettingsIcon width={14} height={14} stroke={muted} />
              <Text style={[styles.engineGroupHintText, styles.systemHintText]}>
                {copy.systemIosSettingsHint}
              </Text>
            </View>
          )}
        </View>
        <SearchableSelectSheet
          testID="tts-system-language-sheet"
          searchTestID="tts-system-language-search"
          optionTestIDPrefix="tts-system-language-option"
          isVisible={languageSheetOpen}
          onClose={() => setLanguageSheetOpen(false)}
          title={copy.systemLanguageSheetTitle}
          searchPlaceholder={copy.systemLanguageSearchPlaceholder}
          options={systemLanguageOptions(voices)}
          value={pickedLanguage ?? ''}
          onSelect={onPickLanguage}
        />
      </>
    );
  },
);
