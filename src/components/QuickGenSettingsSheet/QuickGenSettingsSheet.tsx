import React, {useEffect, useState} from 'react';
import {View, StyleSheet} from 'react-native';
import {Button, Switch, Text} from 'react-native-paper';
import {observer} from 'mobx-react';

import {Sheet} from '../Sheet/Sheet';
import {InputSlider} from '../InputSlider';
import {chatSessionStore, defaultCompletionSettings} from '../../store';
import {CompletionParams} from '../../utils/completionTypes';
import {useTheme} from '../../hooks';
import {L10nContext} from '../../utils';

interface QuickGenSettingsSheetProps {
  isVisible: boolean;
  onClose: () => void;
}

// n_predict === -1 means "unlimited" (generate until EOS). The slider can only
// express a finite cap, so unlimited is a separate toggle; this is the value
// the slider starts at when the user turns unlimited off — matching the finite
// fallback the full Generation Settings sheet uses.
const FINITE_MAX_TOKENS_FALLBACK = 1024;

const resolveMaxTokens = (nPredict: number | undefined) => {
  const n = nPredict ?? defaultCompletionSettings.n_predict ?? -1;
  return {
    isUnlimited: n === -1,
    maxTokens: n > 0 ? n : FINITE_MAX_TOKENS_FALLBACK,
  };
};

export const QuickGenSettingsSheet: React.FC<QuickGenSettingsSheetProps> =
  observer(({isVisible, onClose}) => {
    const theme = useTheme();
    const l10n = React.useContext(L10nContext);

    const activeSession = chatSessionStore.activeSessionId
      ? chatSessionStore.sessions.find(
          s => s.id === chatSessionStore.activeSessionId,
        )
      : null;

    const sourceSettings: CompletionParams =
      activeSession?.completionSettings ?? defaultCompletionSettings;

    const [temperature, setTemperature] = useState(
      sourceSettings.temperature ?? 0.7,
    );
    const [topP, setTopP] = useState(sourceSettings.top_p ?? 0.95);
    const initialMaxTokens = resolveMaxTokens(sourceSettings.n_predict);
    const [isUnlimited, setIsUnlimited] = useState(
      initialMaxTokens.isUnlimited,
    );
    const [maxTokens, setMaxTokens] = useState(initialMaxTokens.maxTokens);

    // Sync sliders when sheet opens or session changes
    useEffect(() => {
      if (isVisible) {
        const s = chatSessionStore.activeSessionId
          ? chatSessionStore.sessions.find(
              ss => ss.id === chatSessionStore.activeSessionId,
            )?.completionSettings
          : null;
        setTemperature(
          s?.temperature ?? defaultCompletionSettings.temperature ?? 0.7,
        );
        setTopP(s?.top_p ?? defaultCompletionSettings.top_p ?? 0.95);
        const resolved = resolveMaxTokens(s?.n_predict);
        setIsUnlimited(resolved.isUnlimited);
        setMaxTokens(resolved.maxTokens);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isVisible, chatSessionStore.activeSessionId]);

    const handleSave = async () => {
      const updated: CompletionParams = {
        ...sourceSettings,
        temperature,
        top_p: topP,
        n_predict: isUnlimited ? -1 : maxTokens,
      };
      await chatSessionStore.updateSessionCompletionSettings(updated);
      onClose();
    };

    const handleReset = () => {
      setTemperature(defaultCompletionSettings.temperature ?? 0.7);
      setTopP(defaultCompletionSettings.top_p ?? 0.95);
      const resolved = resolveMaxTokens(defaultCompletionSettings.n_predict);
      setIsUnlimited(resolved.isUnlimited);
      setMaxTokens(resolved.maxTokens);
    };

    return (
      <Sheet
        title={l10n.quickGenSettings.title}
        isVisible={isVisible}
        onClose={onClose}>
        <Sheet.ScrollView bottomOffset={16}>
          <View style={styles.content}>
            <InputSlider
              label={l10n.quickGenSettings.temperature}
              description={l10n.quickGenSettings.temperatureDesc}
              value={temperature}
              onValueChange={setTemperature}
              min={0}
              max={2}
              step={0.01}
              precision={2}
              testID="quick-temperature-slider"
            />

            <View style={styles.divider} />

            <InputSlider
              label={l10n.quickGenSettings.topP}
              description={l10n.quickGenSettings.topPDesc}
              value={topP}
              onValueChange={setTopP}
              min={0}
              max={1}
              step={0.01}
              precision={2}
              testID="quick-top-p-slider"
            />

            <View style={styles.divider} />

            <View style={styles.toggleRow}>
              <View style={styles.toggleLabelColumn}>
                <Text variant="labelLarge">
                  {l10n.quickGenSettings.maxTokens}
                </Text>
                <Text
                  variant="bodySmall"
                  style={{color: theme.colors.onSurfaceVariant}}>
                  {l10n.quickGenSettings.unlimited}
                </Text>
              </View>
              <Switch
                value={isUnlimited}
                onValueChange={setIsUnlimited}
                testID="quick-unlimited-toggle"
              />
            </View>

            {!isUnlimited && (
              <InputSlider
                label={l10n.quickGenSettings.maxTokens}
                description={l10n.quickGenSettings.maxTokensDesc}
                value={maxTokens}
                onValueChange={v => setMaxTokens(Math.round(v))}
                min={64}
                max={8192}
                step={64}
                precision={0}
                testID="quick-max-tokens-slider"
              />
            )}

            <View style={styles.actions}>
              <Button
                mode="text"
                onPress={handleReset}
                testID="quick-gen-reset">
                {l10n.quickGenSettings.resetDefaults}
              </Button>
              <Button
                mode="contained"
                onPress={handleSave}
                buttonColor={theme.colors.primary}
                testID="quick-gen-apply">
                {l10n.quickGenSettings.apply}
              </Button>
            </View>
          </View>
        </Sheet.ScrollView>
      </Sheet>
    );
  });

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  divider: {
    height: 16,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleLabelColumn: {
    flex: 1,
    paddingRight: 12,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 24,
  },
});
