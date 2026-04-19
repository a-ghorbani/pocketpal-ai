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
import {
  Button,
  IconButton,
  RadioButton,
  Text,
  TouchableRipple,
} from 'react-native-paper';
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
  SUPERTONIC_MODEL_ESTIMATED_BYTES,
  KOKORO_MODEL_ESTIMATED_BYTES,
  KITTEN_MODEL_ESTIMATED_BYTES,
  SystemEngine,
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
import {getEngineAccent} from './VoiceAvatar';
import {l10n as locales, t} from '../../locales';

type L10n = (typeof locales)['en'];
type DownloadState = 'not_installed' | 'downloading' | 'ready' | 'error';

// System TTS hidden until language/accent/search filtering is built —
// 180+ iOS / 470+ Android unfiltered voices is hostile UX.
const ENGINE_ORDER: EngineId[] = ['kitten', 'kokoro', 'supertonic'];

type NeuralEngineId = Exclude<EngineId, 'system'>;

const engineTitle = (engineId: EngineId, l: L10n): string => {
  switch (engineId) {
    case 'kitten':
      return l.voiceAndSpeech.engineChipKitten;
    case 'kokoro':
      return l.voiceAndSpeech.engineChipKokoro;
    case 'supertonic':
      return l.voiceAndSpeech.engineChipSupertonic;
    case 'system':
      return Platform.OS === 'ios'
        ? l.voiceAndSpeech.engineSystemTitleIos
        : l.voiceAndSpeech.engineSystemTitleAndroid;
  }
};

const engineTagline = (engineId: EngineId, l: L10n): string => {
  switch (engineId) {
    case 'kitten':
      return l.voiceAndSpeech.engineKittenTagline;
    case 'kokoro':
      return l.voiceAndSpeech.engineKokoroTagline;
    case 'supertonic':
      return l.voiceAndSpeech.engineSupertonicTagline;
    case 'system':
      return l.voiceAndSpeech.engineSystemTagline;
  }
};

const engineTierLabel = (engineId: EngineId, l: L10n): string => {
  switch (engineId) {
    case 'kitten':
      return l.voiceAndSpeech.engineTierLightest;
    case 'kokoro':
      return l.voiceAndSpeech.engineTierBestQuality;
    case 'supertonic':
      return l.voiceAndSpeech.engineTierFastestStart;
    case 'system':
      return l.voiceAndSpeech.engineSystemTier;
  }
};

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

const NEURAL_ESTIMATED_BYTES: Record<NeuralEngineId, number> = {
  supertonic: SUPERTONIC_MODEL_ESTIMATED_BYTES,
  kokoro: KOKORO_MODEL_ESTIMATED_BYTES,
  kitten: KITTEN_MODEL_ESTIMATED_BYTES,
};

/** True when we know there isn't enough disk space (with 20% buffer). */
const isLowDiskFor = (engineId: NeuralEngineId): boolean => {
  const free = ttsStore.freeDiskBytes;
  if (free == null) {
    return false; // unknown — allow attempt
  }
  return free < NEURAL_ESTIMATED_BYTES[engineId] * 1.2;
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

/**
 * Unified voices view — single screen for the entire TTS sheet.
 *
 * Voices grouped by ENGINE. Each engine group is a self-contained
 * mini engine card: header with logo + spec subtitle + status, body
 * that adapts by state (install card / progress / error / voice rows).
 * No separate Manage Engines view — this IS manage.
 */
export const VoicePickerView: React.FC = observer(() => {
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

  const handlePreviewToggle = (voice: Voice) => {
    if (ttsStore.isPreviewingVoice(voice)) {
      ttsStore.stop().catch(err => {
        console.warn('[VoicePickerView] stop failed:', err);
      });
      return;
    }
    ttsStore.preview(voice).catch(err => {
      console.warn('[VoicePickerView] preview failed:', err);
    });
  };

  const handleDelete = (engineId: NeuralEngineId) => {
    Alert.alert(
      t(l10n.voiceAndSpeech.engineRemoveTitle, {
        engineTitle: engineTitle(engineId, l10n),
      }),
      t(l10n.voiceAndSpeech.engineRemoveBody, {
        sizeMb: ENGINE_META[engineId].sizeMb,
      }),
      [
        {text: l10n.voiceAndSpeech.engineRemoveCancel, style: 'cancel'},
        {
          text: l10n.voiceAndSpeech.engineRemoveConfirm,
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
    const isPreviewing = ttsStore.isPreviewingVoice(voice);
    const accent = getEngineAccent(voice.engine);
    return (
      <TouchableRipple
        key={key}
        onPress={() => handleSelect(voice)}
        testID={`tts-voice-row-${voice.engine}-${voice.id}`}>
        <View style={styles.voiceRow}>
          <RadioButton.Android
            value={key}
            status={isSelected ? 'checked' : 'unchecked'}
            onPress={() => handleSelect(voice)}
            uncheckedColor={theme.colors.outline}
            color={accent}
          />
          <View style={styles.voiceRowLabelBlock}>
            <Text
              style={[
                styles.voiceRowName,
                isSelected && styles.voiceRowNameSelected,
              ]}>
              {voice.name}
            </Text>
          </View>
          <IconButton
            icon={isPreviewing ? 'stop' : 'play'}
            size={18}
            iconColor={accent}
            onPress={() => handlePreviewToggle(voice)}
            accessibilityLabel={
              isPreviewing
                ? l10n.voiceAndSpeech.stopPreviewButton
                : l10n.voiceAndSpeech.previewButton
            }
            testID={`tts-voice-preview-${voice.engine}-${voice.id}`}
            style={styles.voiceRowPreviewBtn}
          />
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
            {t(l10n.voiceAndSpeech.engineDownloadingLabel, {
              pct,
              mbDone,
              sizeMb: meta.sizeMb,
            })}
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
            {l10n.voiceAndSpeech.engineRetryCta}
          </Button>
        </View>
      );
    }

    const lowDisk = isLowDiskFor(engineId);
    const freeMb =
      ttsStore.freeDiskBytes != null
        ? Math.floor(ttsStore.freeDiskBytes / (1024 * 1024))
        : null;

    return (
      <View style={styles.engineGroupBody}>
        <Text style={styles.engineGroupTagline}>
          {engineTagline(engineId, l10n)}
        </Text>
        {lowDisk && freeMb != null ? (
          <Text style={styles.engineGroupErrorText}>
            {t(l10n.voiceAndSpeech.insufficientStorage, {
              requiredMb: meta.sizeMb,
              freeMb,
            })}
          </Text>
        ) : null}
        <Button
          mode="contained"
          onPress={handleInstall}
          disabled={lowDisk}
          buttonColor={meta.accent}
          textColor="#FFFFFF"
          style={styles.engineGroupCta}
          labelStyle={styles.engineGroupCtaLabel}
          testID={`tts-${engineId}-install-button`}>
          {t(l10n.voiceAndSpeech.engineInstallCta, {sizeMb: meta.sizeMb})}
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

    // Two-line subtitle: tier (bold) on top; specs (regular) below.
    // Specs include disk MB AND peak RAM — RAM is the true device-fit
    // signal, especially on lower-end devices where Supertonic's ~430 MB
    // working set matters more than its 265 MB on disk.
    // RAM rounds to nearest 50 MB — exact numbers ("235 MB" vs "228 MB")
    // are noise; the "~" prefix is in the localized template.
    const ramRounded = Math.round(meta.ramMb / 50) * 50;
    const tierLabel = engineTierLabel(engineId, l10n);
    const specsLabel = isNeural
      ? t(l10n.voiceAndSpeech.engineSpecsLine, {
          voices: meta.voices,
          sizeMb: meta.sizeMb,
          ramMb: ramRounded,
        })
      : voices.length
        ? t(l10n.voiceAndSpeech.engineSystemSpecsLine, {voices: voices.length})
        : '';

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
          pointerEvents="none"
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
              <Text style={styles.engineGroupTitle}>
                {engineTitle(engineId, l10n)}
              </Text>
              {tierLabel ? (
                <Text style={[styles.engineGroupTier, {color: meta.accent}]}>
                  {tierLabel}
                </Text>
              ) : null}
              {specsLabel ? (
                <Text style={styles.engineGroupSpecs}>{specsLabel}</Text>
              ) : null}
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
                <Text style={styles.engineGroupEmpty}>
                  {l10n.voiceAndSpeech.voicesEmptyState}
                </Text>
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
