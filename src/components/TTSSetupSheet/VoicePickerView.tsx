import React, {useContext, useEffect, useMemo, useState} from 'react';
import {View} from 'react-native';
import {Button, Text, TouchableRipple} from 'react-native-paper';
import {observer} from 'mobx-react';

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
import {l10n as allL10n, t} from '../../locales';

import {createStyles} from './styles';
import {SecondaryHeader} from './SecondaryHeader';

type Character = 'warm' | 'clear' | 'deep' | 'bright';
type DownloadState = 'not_installed' | 'downloading' | 'ready' | 'error';

const GROUP_ORDER: Character[] = ['warm', 'clear', 'deep', 'bright'];

const characterL10nKey = {
  warm: 'characterWarm',
  clear: 'characterClear',
  deep: 'characterDeep',
  bright: 'characterBright',
} as const;

const engineChipKey = {
  kitten: 'engineChipKitten',
  kokoro: 'engineChipKokoro',
  supertonic: 'engineChipSupertonic',
  system: 'engineChipSystem',
} as const satisfies Record<EngineId, string>;

type NeuralEngineId = Exclude<EngineId, 'system'>;

const neuralStateFor = (engineId: NeuralEngineId) => {
  switch (engineId) {
    case 'kitten':
      return ttsStore.kittenDownloadState;
    case 'kokoro':
      return ttsStore.kokoroDownloadState;
    case 'supertonic':
      return ttsStore.supertonicDownloadState;
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

const isEngineReady = (engineId: EngineId): boolean => {
  if (engineId === 'system') {
    return true;
  }
  return neuralStateFor(engineId) === 'ready';
};

interface VoicePickerViewProps {
  onBack: () => void;
}

/**
 * Secondary in-sheet view: every voice from every engine grouped by
 * perceptual character (Warm / Clear / Deep / Bright). Voices whose
 * engine is not installed render dimmed; tapping a dimmed voice opens an
 * inline install CTA, and the row becomes selectable the moment its
 * engine flips to `ready`.
 */
export const VoicePickerView: React.FC<VoicePickerViewProps> = observer(
  ({onBack}) => {
    const theme = useTheme();
    const l10n = useContext(L10nContext);
    const styles = createStyles(theme);

    const [systemVoices, setSystemVoices] = useState<Voice[]>([]);
    const [pendingInstall, setPendingInstall] = useState<{
      engine: NeuralEngineId;
      voice: Voice;
    } | null>(null);

    // Snapshot of install flows the user has kicked off from this view. We
    // keep them "remembered" so once the engine flips to ready we can
    // auto-select the voice the user was trying to install — matching the
    // flow in the ready-voice tap branch below.
    const [installInFlight, setInstallInFlight] = useState<Record<
      NeuralEngineId,
      Voice | undefined
    > | null>(null);

    useEffect(() => {
      let cancelled = false;
      const engine = new SystemEngine();
      engine
        .getVoices()
        .then(v => {
          if (!cancelled) {
            setSystemVoices(v);
          }
        })
        .catch(err => {
          console.warn('[VoicePickerView] system getVoices failed:', err);
        });
      return () => {
        cancelled = true;
      };
    }, []);

    const allVoices = useMemo<Voice[]>(
      () => [
        ...KITTEN_VOICES,
        ...KOKORO_VOICES.filter(v => v.language?.startsWith('en') ?? false),
        ...SUPERTONIC_VOICES,
        ...systemVoices,
      ],
      [systemVoices],
    );

    // Snapshot MobX observables into plain locals so they're valid
    // effect deps. The `observer` wrapper already re-renders the
    // component when they change — we just need to react to each flip.
    const kittenState = ttsStore.kittenDownloadState;
    const kokoroState = ttsStore.kokoroDownloadState;
    const supertonicState = ttsStore.supertonicDownloadState;

    // Watch for an in-flight install finishing; auto-select the voice and
    // close the sheet (same outcome as tapping a ready row).
    useEffect(() => {
      if (!installInFlight) {
        return;
      }
      const stateByEngine: Record<NeuralEngineId, DownloadState> = {
        kitten: kittenState,
        kokoro: kokoroState,
        supertonic: supertonicState,
      };
      (Object.keys(installInFlight) as NeuralEngineId[]).forEach(engineId => {
        const voice = installInFlight[engineId];
        if (voice && stateByEngine[engineId] === 'ready') {
          ttsStore.setCurrentVoice({
            id: voice.id,
            name: voice.name,
            engine: voice.engine,
            language: voice.language,
          });
          ttsStore.closeSetupSheet();
          setInstallInFlight(prev => {
            if (!prev) {
              return prev;
            }
            const next = {...prev};
            next[engineId] = undefined;
            return next;
          });
          setPendingInstall(null);
        }
      });
    }, [installInFlight, kittenState, kokoroState, supertonicState]);

    const grouped = useMemo(() => {
      const map: Record<Character, Voice[]> = {
        warm: [],
        clear: [],
        deep: [],
        bright: [],
      };
      allVoices.forEach(v => {
        const key = (v.character ?? 'clear') as Character;
        map[key].push(v);
      });
      const compare = (a: Voice, b: Voice) => {
        // Female first, then system voices after neural voices within the
        // 'clear' bucket (OS voices are default-bucketed there and should
        // not lead), then by display name.
        const ag = a.gender === 'f' ? 0 : a.gender === 'm' ? 1 : 2;
        const bg = b.gender === 'f' ? 0 : b.gender === 'm' ? 1 : 2;
        if (ag !== bg) {
          return ag - bg;
        }
        const aSys = a.engine === 'system' ? 1 : 0;
        const bSys = b.engine === 'system' ? 1 : 0;
        if (aSys !== bSys) {
          return aSys - bSys;
        }
        return a.name.localeCompare(b.name);
      };
      GROUP_ORDER.forEach(k => map[k].sort(compare));
      return map;
    }, [allVoices]);

    const selectedKey = ttsStore.currentVoice
      ? `${ttsStore.currentVoice.engine}:${ttsStore.currentVoice.id}`
      : null;

    const handleSelectReady = (voice: Voice) => {
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

    const handleDimmedTap = (voice: Voice) => {
      if (voice.engine === 'system') {
        return;
      }
      setPendingInstall({engine: voice.engine, voice});
    };

    const handleInstallNow = () => {
      if (!pendingInstall) {
        return;
      }
      const {engine, voice} = pendingInstall;
      setInstallInFlight(prev => ({
        kitten: prev?.kitten,
        kokoro: prev?.kokoro,
        supertonic: prev?.supertonic,
        [engine]: voice,
      }));
      triggerDownload(engine).catch(err => {
        console.warn(`[VoicePickerView] install ${engine} failed:`, err);
      });
    };

    const renderVoiceRow = (voice: Voice) => {
      const key = `${voice.engine}:${voice.id}`;
      const isSelected = key === selectedKey;
      const ready = isEngineReady(voice.engine);
      const rowTestId = `tts-voice-row-${voice.engine}-${voice.id}`;
      const showPendingCta =
        !ready &&
        pendingInstall &&
        pendingInstall.engine === voice.engine &&
        pendingInstall.voice.id === voice.id;

      const rowBody = (
        <View style={[styles.voiceRow, !ready && styles.rowDisabled]}>
          <View style={styles.voiceRowLabelBlock}>
            <Text
              style={[
                styles.voiceRowName,
                isSelected && styles.voiceRowNameSelected,
              ]}>
              {voice.name}
            </Text>
            <View style={styles.voiceRowSubline}>
              <View style={styles.chip}>
                <Text style={styles.chipText}>
                  {l10n.voiceAndSpeech[engineChipKey[voice.engine]]}
                </Text>
              </View>
            </View>
          </View>
          {ready ? (
            <Button
              mode="text"
              compact
              style={styles.previewButton}
              testID={`tts-voice-preview-${voice.engine}-${voice.id}`}
              onPress={() => handlePreview(voice)}>
              {l10n.voiceAndSpeech.previewButton}
            </Button>
          ) : null}
          {isSelected ? <Text style={styles.voiceRowCheck}>✓</Text> : null}
        </View>
      );

      return (
        <View key={key}>
          {ready ? (
            <TouchableRipple
              onPress={() => handleSelectReady(voice)}
              testID={rowTestId}>
              {rowBody}
            </TouchableRipple>
          ) : (
            <TouchableRipple
              onPress={() => handleDimmedTap(voice)}
              testID={rowTestId}
              accessibilityState={{disabled: false}}>
              {rowBody}
            </TouchableRipple>
          )}
          {showPendingCta ? renderInlineInstall(voice) : null}
        </View>
      );
    };

    const renderInlineInstall = (voice: Voice) => {
      if (voice.engine === 'system') {
        return null;
      }
      const state = neuralStateFor(voice.engine);
      const engineLabel =
        allL10n.en.voiceAndSpeech[engineChipKey[voice.engine]];
      const ctaText = t(l10n.voiceAndSpeech.installToUseCta, {
        engine: engineLabel,
        voice: voice.name,
      });
      if (state === 'downloading') {
        return (
          <View
            style={styles.inlineInstallCta}
            testID={`tts-install-cta-${voice.engine}`}>
            <Text style={styles.inlineInstallCtaText}>
              {l10n.voiceAndSpeech.installing}
            </Text>
          </View>
        );
      }
      if (state === 'error') {
        return (
          <View
            style={[styles.inlineInstallCta, styles.installCardError]}
            testID={`tts-install-cta-${voice.engine}`}>
            <Text style={styles.inlineInstallCtaText}>{ctaText}</Text>
            <View style={styles.inlineInstallCtaActions}>
              <Button
                mode="contained"
                compact
                onPress={handleInstallNow}
                testID={`tts-install-now-${voice.engine}`}>
                {l10n.voiceAndSpeech.installNow}
              </Button>
            </View>
          </View>
        );
      }
      // not_installed
      return (
        <View
          style={styles.inlineInstallCta}
          testID={`tts-install-cta-${voice.engine}`}>
          <Text style={styles.inlineInstallCtaText}>{ctaText}</Text>
          <View style={styles.inlineInstallCtaActions}>
            <Button
              mode="contained"
              compact
              onPress={handleInstallNow}
              testID={`tts-install-now-${voice.engine}`}>
              {l10n.voiceAndSpeech.installNow}
            </Button>
          </View>
        </View>
      );
    };

    return (
      <Sheet.ScrollView
        contentContainerStyle={styles.container}
        testID="tts-voice-picker">
        <SecondaryHeader
          title={l10n.voiceAndSpeech.browseVoicesTitle}
          onBack={onBack}
          testID="tts-voice-picker-header"
        />
        {GROUP_ORDER.map(character => {
          const voices = grouped[character];
          if (voices.length === 0) {
            return null;
          }
          return (
            <View key={character}>
              <Text
                style={styles.groupHeader}
                testID={`tts-voice-group-${character}`}>
                {l10n.voiceAndSpeech[characterL10nKey[character]]}
              </Text>
              {voices.map(renderVoiceRow)}
            </View>
          );
        })}
      </Sheet.ScrollView>
    );
  },
);
