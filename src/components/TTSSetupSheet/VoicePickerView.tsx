import React, {useContext, useEffect, useMemo, useState} from 'react';
import {
  Alert,
  LayoutAnimation,
  Platform,
  StyleSheet,
  UIManager,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {Button, IconButton, Text, TouchableRipple} from 'react-native-paper';
import {observer} from 'mobx-react';

import {ChevronRightIcon} from '../../assets/icons';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

import {Sheet} from '../Sheet';
import {useTheme} from '../../hooks';
import {
  KITTEN_VOICES,
  KOKORO_VOICES,
  SUPERTONIC_VOICES,
  SystemEngine,
  TTS_PREVIEW_SAMPLE,
  getEngine,
} from '../../services/tts';
import type {EngineId, Voice} from '../../services/tts';
import {ttsStore} from '../../store';
import {L10nContext} from '../../utils';

import {AutoSpeakRow} from './AutoSpeakRow';
import {createStyles} from './styles';
import {EngineLogo} from './EngineLogo';
import {ENGINE_META} from './engineMeta';
import {HeroRow} from './HeroRow';
import {VoiceAvatar, getEngineAccent} from './VoiceAvatar';

type DownloadState = 'not_installed' | 'downloading' | 'ready' | 'error';

const ENGINE_ORDER: EngineId[] = ['kitten', 'kokoro', 'supertonic', 'system'];

type NeuralEngineId = Exclude<EngineId, 'system'>;

const neuralStateFor = (engineId: NeuralEngineId): DownloadState => {
  switch (engineId) {
    case 'kitten':
      return ttsStore.kittenDownloadState;
    case 'kokoro':
      return ttsStore.kokoroDownloadState;
    case 'supertonic':
      return ttsStore.supertonicDownloadState;
  }
};

const neuralProgressFor = (engineId: NeuralEngineId): number => {
  switch (engineId) {
    case 'kitten':
      return ttsStore.kittenDownloadProgress;
    case 'kokoro':
      return ttsStore.kokoroDownloadProgress;
    case 'supertonic':
      return ttsStore.supertonicDownloadProgress;
  }
};

const neuralErrorFor = (engineId: NeuralEngineId): string | null => {
  switch (engineId) {
    case 'kitten':
      return ttsStore.kittenDownloadError;
    case 'kokoro':
      return ttsStore.kokoroDownloadError;
    case 'supertonic':
      return ttsStore.supertonicDownloadError;
  }
};

const triggerDownload = (engineId: NeuralEngineId) => {
  switch (engineId) {
    case 'kitten':
      return ttsStore.downloadKitten();
    case 'kokoro':
      return ttsStore.downloadKokoro();
    case 'supertonic':
      return ttsStore.downloadSupertonic();
  }
};

const triggerRetry = (engineId: NeuralEngineId) => {
  switch (engineId) {
    case 'kitten':
      return ttsStore.retryKittenDownload();
    case 'kokoro':
      return ttsStore.retryKokoroDownload();
    case 'supertonic':
      return ttsStore.retryDownload();
  }
};

const triggerDelete = (engineId: NeuralEngineId) => {
  switch (engineId) {
    case 'kitten':
      return ttsStore.deleteKitten();
    case 'kokoro':
      return ttsStore.deleteKokoro();
    case 'supertonic':
      return ttsStore.deleteSupertonic();
  }
};

const isEngineReady = (engineId: EngineId): boolean => {
  if (engineId === 'system') {
    return true;
  }
  return neuralStateFor(engineId) === 'ready';
};

const VOICES_BY_ENGINE: Record<EngineId, Voice[]> = {
  kitten: KITTEN_VOICES,
  kokoro: KOKORO_VOICES,
  supertonic: SUPERTONIC_VOICES,
  system: [], // populated async via SystemEngine
};

interface VoicePickerViewProps {
  /** Optional — back affordance for legacy embeds; main view doesn't need it. */
  onBack?: () => void;
}

/**
 * Unified voices view — single screen for the entire TTS sheet.
 *
 * Voices grouped by ENGINE (was: character). Each engine group is a
 * self-contained mini engine card: header with logo + spec subtitle +
 * status, body that adapts by state (install card / progress / error /
 * voice rows). No separate Manage Engines view — this IS manage.
 */
export const VoicePickerView: React.FC<VoicePickerViewProps> = observer(() => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const styles = createStyles(theme);

  const [systemVoices, setSystemVoices] = useState<Voice[]>([]);
  const [expanded, setExpanded] = useState<Set<EngineId>>(() => {
    const active = ttsStore.currentVoice?.engine;
    return new Set(active ? [active] : []);
  });

  const toggleExpanded = (engineId: EngineId) => {
    LayoutAnimation.configureNext(
      LayoutAnimation.create(
        220,
        LayoutAnimation.Types.easeInEaseOut,
        LayoutAnimation.Properties.opacity,
      ),
    );
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(engineId)) {
        next.delete(engineId);
      } else {
        next.add(engineId);
      }
      return next;
    });
  };

  useEffect(() => {
    const sys = getEngine('system') as SystemEngine;
    sys
      .getVoices()
      .then(vs => setSystemVoices(vs))
      .catch(err => {
        console.warn('[VoicePickerView] system voices failed:', err);
      });
  }, []);

  const voicesByEngine = useMemo(() => {
    return {
      ...VOICES_BY_ENGINE,
      system: systemVoices,
    };
  }, [systemVoices]);

  const selectedKey = ttsStore.currentVoice
    ? `${ttsStore.currentVoice.engine}:${ttsStore.currentVoice.id}`
    : null;

  const handleSelect = (voice: Voice) => {
    ttsStore.setCurrentVoice({
      id: voice.id,
      name: voice.name,
      engine: voice.engine,
      language: voice.language,
    });
    ttsStore.closeSetupSheet();
  };

  const handlePreview = (voice: Voice) => {
    getEngine(voice.engine)
      .play(TTS_PREVIEW_SAMPLE, voice)
      .catch(err => {
        console.warn('[VoicePickerView] preview failed:', err);
      });
  };

  const handleDelete = (engineId: NeuralEngineId) => {
    Alert.alert(
      `Remove ${ENGINE_META[engineId].title}?`,
      `Frees ~${ENGINE_META[engineId].sizeMb} MB on this device.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            triggerDelete(engineId).catch(err => {
              console.warn(`[VoicePickerView] delete ${engineId} failed:`, err);
            });
          },
        },
      ],
    );
  };

  const renderVoiceRow = (voice: Voice) => {
    const key = `${voice.engine}:${voice.id}`;
    const isSelected = key === selectedKey;
    const accent = getEngineAccent(voice.engine);
    return (
      <TouchableRipple
        key={key}
        onPress={() => handleSelect(voice)}
        testID={`tts-voice-row-${voice.engine}-${voice.id}`}>
        <View style={styles.voiceRow}>
          <View
            style={[
              styles.voiceRowSelectedBar,
              {backgroundColor: isSelected ? accent : 'transparent'},
            ]}
          />
          <View style={styles.voiceRowAvatarWrap}>
            <VoiceAvatar
              voice={voice}
              size={34}
              ringColor={isSelected ? accent : undefined}
            />
          </View>
          <View style={styles.voiceRowLabelBlock}>
            <Text
              style={[
                styles.voiceRowName,
                isSelected && styles.voiceRowNameSelected,
              ]}>
              {voice.name}
            </Text>
          </View>
          <Button
            mode="text"
            compact
            style={styles.previewButton}
            textColor={accent}
            testID={`tts-voice-preview-${voice.engine}-${voice.id}`}
            onPress={() => handlePreview(voice)}>
            {l10n.voiceAndSpeech.previewButton}
          </Button>
        </View>
      </TouchableRipple>
    );
  };

  const renderInstallCard = (engineId: NeuralEngineId) => {
    const meta = ENGINE_META[engineId];
    const state = neuralStateFor(engineId);
    const progress = neuralProgressFor(engineId);
    const error = neuralErrorFor(engineId);

    const handleInstall = () => {
      triggerDownload(engineId).catch(err => {
        console.warn(`[VoicePickerView] install ${engineId} failed:`, err);
      });
    };
    const handleRetry = () => {
      triggerRetry(engineId).catch(err => {
        console.warn(`[VoicePickerView] retry ${engineId} failed:`, err);
      });
    };

    if (state === 'downloading') {
      const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100);
      const mbDone = Math.round((pct / 100) * meta.sizeMb);
      return (
        <View style={styles.engineGroupBody}>
          <Text style={styles.engineGroupProgressText}>
            {`Downloading…  ${pct}%  ·  ${mbDone} / ${meta.sizeMb} MB`}
          </Text>
        </View>
      );
    }
    if (state === 'error') {
      return (
        <View style={styles.engineGroupBody}>
          {error ? (
            <Text style={styles.engineGroupErrorText}>{error}</Text>
          ) : null}
          <Button
            mode="contained"
            onPress={handleRetry}
            buttonColor={meta.accent}
            textColor="#FFFFFF"
            style={styles.engineGroupCta}
            labelStyle={styles.engineGroupCtaLabel}
            testID={`tts-${engineId}-retry-button`}>
            Try again
          </Button>
        </View>
      );
    }
    return (
      <View style={styles.engineGroupBody}>
        <Button
          mode="contained"
          onPress={handleInstall}
          buttonColor={meta.accent}
          textColor="#FFFFFF"
          style={styles.engineGroupCta}
          labelStyle={styles.engineGroupCtaLabel}
          testID={`tts-${engineId}-install-button`}>
          {`Install · ${meta.sizeMb} MB`}
        </Button>
      </View>
    );
  };

  const renderEngineGroup = (engineId: EngineId) => {
    const meta = ENGINE_META[engineId];
    const voices = voicesByEngine[engineId];
    const isNeural = engineId !== 'system';
    const state: DownloadState = isNeural
      ? neuralStateFor(engineId as NeuralEngineId)
      : 'ready';
    const ready = isEngineReady(engineId);
    const isActive = ttsStore.currentVoice?.engine === engineId && ready;

    const subtitleParts: string[] = [];
    if (isNeural) {
      subtitleParts.push(`${meta.voices} voices`);
      subtitleParts.push(`${meta.sizeMb} MB`);
      subtitleParts.push(meta.tier);
    } else {
      subtitleParts.push('Always available');
      if (voices.length) {
        subtitleParts.push(`${voices.length} voices`);
      }
    }

    const ringProgress =
      isNeural && state === 'downloading'
        ? neuralProgressFor(engineId as NeuralEngineId)
        : null;

    const isExpanded = expanded.has(engineId);

    return (
      <View
        key={engineId}
        style={styles.engineGroup}
        testID={`tts-engine-group-${engineId}`}>
        <LinearGradient
          colors={[meta.gradientFrom, meta.gradientTo]}
          start={{x: 0, y: 0}}
          end={{x: 1, y: 1}}
          style={[StyleSheet.absoluteFill, styles.engineGroupGradientFill]}
        />
        <TouchableRipple
          onPress={() => toggleExpanded(engineId)}
          testID={`tts-engine-group-toggle-${engineId}`}>
          <View style={styles.engineGroupHeader}>
            <EngineLogo
              engineId={engineId}
              size={36}
              progress={ringProgress}
              ringColor={meta.accent}
              haloColor={isActive ? meta.accent : undefined}
            />
            <View style={styles.engineGroupHeaderText}>
              <Text style={styles.engineGroupTitle}>{meta.title}</Text>
              <Text style={styles.engineGroupSubtitle}>
                {subtitleParts.join('  ·  ')}
              </Text>
            </View>
            {isNeural && state === 'ready' && isExpanded ? (
              <IconButton
                icon="trash-can-outline"
                size={18}
                iconColor={theme.colors.onSurfaceVariant}
                onPress={() => handleDelete(engineId as NeuralEngineId)}
                testID={`tts-${engineId}-delete-button`}
                style={styles.engineGroupDeleteBtn}
              />
            ) : null}
            <View
              style={[
                styles.engineGroupChevron,
                isExpanded && styles.engineGroupChevronExpanded,
              ]}>
              <ChevronRightIcon stroke={theme.colors.onSurfaceVariant} />
            </View>
          </View>
        </TouchableRipple>
        {isExpanded ? (
          ready ? (
            voices.length > 0 ? (
              voices.map(renderVoiceRow)
            ) : (
              <View style={styles.engineGroupBody}>
                <Text style={styles.engineGroupEmpty}>No voices found.</Text>
              </View>
            )
          ) : (
            renderInstallCard(engineId as NeuralEngineId)
          )
        ) : null}
      </View>
    );
  };

  const hasCurrentVoice = ttsStore.currentVoice != null;

  return (
    <Sheet.ScrollView
      contentContainerStyle={styles.container}
      testID="tts-voice-picker">
      {hasCurrentVoice ? (
        <>
          <HeroRow />
          <AutoSpeakRow />
        </>
      ) : (
        <Text style={styles.voicesEmptyHint}>
          {l10n.voiceAndSpeech.voicesEmptyHint}
        </Text>
      )}
      {ENGINE_ORDER.map(renderEngineGroup)}
    </Sheet.ScrollView>
  );
});
