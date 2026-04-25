import React, {useEffect, useState} from 'react';
import {View, StyleSheet} from 'react-native';
import {Button} from 'react-native-paper';
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
    const [maxTokens, setMaxTokens] = useState(
      sourceSettings.n_predict ?? 1024,
    );

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
        setMaxTokens(
          s?.n_predict ?? defaultCompletionSettings.n_predict ?? 1024,
        );
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isVisible, chatSessionStore.activeSessionId]);

    const handleSave = async () => {
      const updated: CompletionParams = {
        ...sourceSettings,
        temperature,
        top_p: topP,
        n_predict: maxTokens,
      };
      await chatSessionStore.updateSessionCompletionSettings(updated);
      onClose();
    };

    const handleReset = () => {
      setTemperature(defaultCompletionSettings.temperature ?? 0.7);
      setTopP(defaultCompletionSettings.top_p ?? 0.95);
      setMaxTokens(defaultCompletionSettings.n_predict ?? 1024);
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
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 24,
  },
});
