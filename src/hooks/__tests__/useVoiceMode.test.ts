import {AppState, Platform} from 'react-native';
import {act, renderHook} from '@testing-library/react-native';
import {fromByteArray} from 'base64-js';
import {observable, runInAction} from 'mobx';
import AudioRecord from '@fugood/react-native-audio-pcm-stream';
import DeviceInfo from 'react-native-device-info';
import {onAudioInterruption} from '@pocketpalai/react-native-speech';
import {check} from 'react-native-permissions';

import {modelsList} from '../../../jest/fixtures/models';
import {
  ASR_CHUNK_BYTES,
  ASR_IOS_CEILING_SHARE,
  ASR_TIERS,
} from '../../services/asr/constants';
import {TTS_ENGINE_RUNTIME_BYTES} from '../../services/tts/constants';
import {
  asrStore,
  chatSessionStore,
  modelStore,
  ttsStore,
  uiStore,
  voiceEntitlement,
  voiceModeStore,
} from '../../store';
import {acquireKeepAwake} from '../../utils/keepAwake';
import {ModelOrigin} from '../../utils/types';
import {
  VOICE_CAPTURE_SETTLE_MS,
  VOICE_MIC_WATCHDOG_MS,
  VOICE_START_TIMEOUT_MS,
} from '../../services/voice';
import type {VoiceTurnEvents, VoiceTurnOutcome} from '../../services/voice';

import {useVoiceMode} from '../useVoiceMode';

let mockBlur: (() => void) | undefined;
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useFocusEffect: (effect: () => (() => void) | undefined) => {
    const {useEffect} = require('react');
    useEffect(() => {
      const cleanup = effect();
      mockBlur = cleanup;
      return cleanup;
    }, [effect]);
  },
}));

const appStateHandlers: Array<(state: string) => void> = [];
jest.spyOn(AppState, 'addEventListener').mockImplementation(((
  _event: string,
  handler: (state: string) => void,
) => {
  appStateHandlers.push(handler);
  return {
    remove: () => {
      appStateHandlers.splice(appStateHandlers.indexOf(handler), 1);
    },
  };
}) as any);
const setAppState = (state: string) =>
  act(() => {
    [...appStateHandlers].forEach(handler => handler(state));
  });

type FakeTurn = {
  utterance: Uint8Array;
  port: {
    send: (text: string, onTurnCreated: (id: string) => void) => Promise<void>;
  };
  on: VoiceTurnEvents;
  done: Promise<VoiceTurnOutcome>;
  finish: (outcome: VoiceTurnOutcome) => void;
  interrupt: jest.Mock;
};

function makeEngine() {
  const turns: FakeTurn[] = [];
  const engine = {
    id: 'cascade' as const,
    prepare: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    runTurn: jest.fn((utterance: Uint8Array, turnPort, on: VoiceTurnEvents) => {
      let finish!: (outcome: VoiceTurnOutcome) => void;
      const done = new Promise<VoiceTurnOutcome>(resolve => {
        finish = resolve;
      });
      const turn: FakeTurn = {
        utterance,
        port: turnPort,
        on,
        done,
        finish,
        interrupt: jest.fn(async () => finish('interrupted')),
      };
      turns.push(turn);
      return turn;
    }),
  };
  return {engine, turns};
}

const pcm = (amplitude: number) => {
  const bytes = new Uint8Array(ASR_CHUNK_BYTES);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < ASR_CHUNK_BYTES / 2; i++) {
    view.setInt16(i * 2, (i % 2 ? 1 : -1) * amplitude * 0x7fff, true);
  }
  return fromByteArray(bytes);
};
const VOICED = pcm(0.1);
const SILENT = pcm(0);

const micListener = () => {
  const calls = (AudioRecord.on as jest.Mock).mock.calls;
  return calls[calls.length - 1][1] as (chunk: string) => void;
};
const speak = (ms: number, chunk = VOICED) => {
  const listener = micListener();
  act(() => {
    for (let i = 0; i < ms / 50; i++) {
      listener(chunk);
    }
  });
};
const flush = () => act(async () => {});
const settleMic = () =>
  act(
    () =>
      new Promise<void>(resolve =>
        setTimeout(resolve, VOICE_CAPTURE_SETTLE_MS + 20),
      ),
  );

const localModel = modelsList[0];
const port = {send: jest.fn(), stop: jest.fn()};
const openModelPicker = jest.fn();
const focusInput = jest.fn();
const actions = {openModelPicker, focusInput};

function renderVoiceMode() {
  const {engine, turns} = makeEngine();
  const hook = renderHook(() => useVoiceMode({port, engine: engine as any}));
  const enter = async () => {
    await act(async () => {
      await hook.result.current.requestEntry(actions);
    });
  };
  return {hook, engine, turns, enter};
}

const tts = ttsStore as any;
const model = modelStore as any;

describe('useVoiceMode', () => {
  const backWithBox = (target: object, key: string) => {
    const box = observable.box<unknown>(undefined);
    Object.defineProperty(target, key, {
      configurable: true,
      get: () => box.get(),
      set: value => runInAction(() => box.set(value)),
    });
  };

  beforeAll(() => {
    backWithBox(chatSessionStore, 'activeSessionId');
    backWithBox(modelStore, 'activeModelId');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (voiceModeStore as any).reset();
    voiceEntitlement.register((voiceEntitlement as any).defaultSource);
    voiceModeStore.setUnlockOverride(true);
    (AudioRecord.on as jest.Mock).mockReturnValue({remove: jest.fn()});
    (AudioRecord.init as jest.Mock).mockResolvedValue(undefined);
    (check as jest.Mock).mockResolvedValue('granted');
    Platform.OS = 'ios';
    runInAction(() => {
      chatSessionStore.activeSessionId = 'session-1';
      model.models = modelsList;
      model.activeModelId = localModel.id;
      model.isContextLoading = false;
      model.loadedModelBytes = 1e9;
      model.availableMemoryCeiling = 5e9;
      model.largestSuccessfulLoad = 4e9;
      asrStore.selectedTier = 'base';
      asrStore.downloadStates.base = 'ready';
      asrStore.downloadStates.small = 'not_installed';
      asrStore.downloadStates['large-turbo'] = 'not_installed';
      tts.currentVoice = {id: 'F1', name: 'F1', engine: 'supertonic'};
      tts.phononSupported = false;
    });
  });

  describe('entry', () => {
    it('shows the teaser, not the paywall, when voice mode is locked', async () => {
      voiceModeStore.setUnlockOverride(false);
      const {enter, engine, hook} = renderVoiceMode();

      await enter();

      expect(hook.result.current.sheet).toEqual({kind: 'teaser'});
      expect(
        (voiceEntitlement as any).defaultSource.openPaywall,
      ).not.toHaveBeenCalled();
      expect(engine.prepare).not.toHaveBeenCalled();
      expect(voiceModeStore.phase).toBe('closed');
    });

    it('starts no engine, mic, speech or keep-awake while the teaser shows', async () => {
      voiceModeStore.setUnlockOverride(false);
      const {enter, engine} = renderVoiceMode();

      await enter();

      expect(engine.prepare).not.toHaveBeenCalled();
      expect(AudioRecord.init).not.toHaveBeenCalled();
      expect(AudioRecord.start).not.toHaveBeenCalled();
      expect(check).not.toHaveBeenCalled();
      expect(acquireKeepAwake).not.toHaveBeenCalled();
      expect(ttsStore.voiceOutputActive).toBe(false);
    });

    it('Get Plus closes the teaser and opens the paywall once', async () => {
      voiceModeStore.setUnlockOverride(false);
      const {enter, hook} = renderVoiceMode();
      await enter();

      act(() => hook.result.current.getPlus());

      expect(hook.result.current.sheet).toBeNull();
      expect(
        (voiceEntitlement as any).defaultSource.openPaywall,
      ).toHaveBeenCalledTimes(1);
    });

    it('Keep typing closes the teaser, then focuses the composer', async () => {
      voiceModeStore.setUnlockOverride(false);
      const {enter, hook} = renderVoiceMode();
      await enter();
      jest.useFakeTimers();

      act(() => hook.result.current.keepTyping());

      expect(hook.result.current.sheet).toBeNull();
      expect(focusInput).not.toHaveBeenCalled();
      act(() => jest.runOnlyPendingTimers());
      jest.useRealTimers();
      expect(focusInput).toHaveBeenCalledTimes(1);
      expect(
        (voiceEntitlement as any).defaultSource.openPaywall,
      ).not.toHaveBeenCalled();
    });

    it('leaving the screen closes the teaser', async () => {
      voiceModeStore.setUnlockOverride(false);
      const {enter, hook} = renderVoiceMode();
      await enter();
      expect(hook.result.current.sheet).toEqual({kind: 'teaser'});

      act(() => mockBlur?.());

      expect(hook.result.current.sheet).toBeNull();
    });

    it('closing the teaser leaves the composer alone', async () => {
      voiceModeStore.setUnlockOverride(false);
      const {enter, hook} = renderVoiceMode();
      await enter();

      act(() => hook.result.current.dismissSheet());

      expect(hook.result.current.sheet).toBeNull();
      expect(focusInput).not.toHaveBeenCalled();
      expect(
        (voiceEntitlement as any).defaultSource.openPaywall,
      ).not.toHaveBeenCalled();
    });

    it('an unlock that arrives after the chat screen is gone starts nothing', async () => {
      voiceModeStore.setUnlockOverride(false);
      const {enter, engine, hook} = renderVoiceMode();
      await enter();
      act(() => hook.result.current.getPlus());
      const [{onUnlocked}] = (voiceEntitlement as any).defaultSource.openPaywall
        .mock.calls[0];
      hook.unmount();

      voiceModeStore.setUnlockOverride(true);
      await act(async () => {
        await onUnlocked();
      });

      expect(engine.prepare).not.toHaveBeenCalled();
      expect(AudioRecord.init).not.toHaveBeenCalled();
      expect(voiceModeStore.phase).toBe('closed');
    });

    it('resumes entry when the paywall reports an unlock', async () => {
      voiceModeStore.setUnlockOverride(false);
      const {enter, engine, hook} = renderVoiceMode();
      await enter();
      act(() => hook.result.current.getPlus());
      const [{onUnlocked}] = (voiceEntitlement as any).defaultSource.openPaywall
        .mock.calls[0];

      voiceModeStore.setUnlockOverride(true);
      await act(async () => {
        await onUnlocked();
      });

      expect(engine.prepare).toHaveBeenCalledTimes(1);
      expect(voiceModeStore.phase).toBe('listening');
    });

    it('after an unlock with no model loaded, opens the model picker', async () => {
      voiceModeStore.setUnlockOverride(false);
      runInAction(() => {
        model.activeModelId = undefined;
      });
      const {enter, hook} = renderVoiceMode();
      await enter();
      act(() => hook.result.current.getPlus());
      const [{onUnlocked}] = (voiceEntitlement as any).defaultSource.openPaywall
        .mock.calls[0];

      voiceModeStore.setUnlockOverride(true);
      await act(async () => {
        await onUnlocked();
      });

      expect(openModelPicker).toHaveBeenCalledTimes(1);
      expect(hook.result.current.sheet).toBeNull();
    });

    it('opens only the model picker when no model is loaded', async () => {
      runInAction(() => {
        model.activeModelId = undefined;
      });
      const {enter, hook, engine} = renderVoiceMode();

      await enter();

      expect(openModelPicker).toHaveBeenCalledTimes(1);
      expect(hook.result.current.sheet).toBeNull();
      expect(engine.prepare).not.toHaveBeenCalled();
      expect(voiceModeStore.phase).toBe('closed');
    });

    it('does nothing while the model loads', async () => {
      runInAction(() => {
        model.isContextLoading = true;
      });
      const {enter, hook, engine} = renderVoiceMode();

      await enter();

      expect(hook.result.current.sheet).toBeNull();
      expect(engine.prepare).not.toHaveBeenCalled();
    });

    it.each([
      [
        'whisper base is not installed',
        () => {
          asrStore.downloadStates.base = 'not_installed';
        },
      ],
      [
        'the voice is the system voice',
        () => {
          tts.currentVoice = {id: 's', name: 's', engine: 'system'};
        },
      ],
      ['there is no voice', () => (tts.currentVoice = null)],
      [
        'the voice is Phonon on a device that does not support it',
        () => {
          tts.currentVoice = {id: 'Zoey', name: 'Zoey', engine: 'phonon'};
        },
      ],
      [
        'the microphone is not granted',
        () => (check as jest.Mock).mockResolvedValue('denied'),
      ],
    ])('opens the setup sheet when %s', async (_case, arrange) => {
      runInAction(arrange);
      const {enter, hook, engine} = renderVoiceMode();

      await enter();

      expect(hook.result.current.sheet).toEqual({kind: 'setup'});
      expect(engine.prepare).not.toHaveBeenCalled();
    });

    it('enters with a Phonon voice on a device that supports it', async () => {
      runInAction(() => {
        tts.currentVoice = {id: 'Zoey', name: 'Zoey', engine: 'phonon'};
        tts.phononSupported = true;
      });
      const {enter, hook, engine} = renderVoiceMode();

      await enter();

      expect(hook.result.current.sheet).toBeNull();
      expect(engine.prepare).toHaveBeenCalledTimes(1);
    });

    it('leaving the screen keeps the setup sheet open', async () => {
      runInAction(() => {
        asrStore.downloadStates.base = 'not_installed';
      });
      const {enter, hook} = renderVoiceMode();
      await enter();
      expect(hook.result.current.sheet).toEqual({kind: 'setup'});

      act(() => mockBlur?.());

      expect(hook.result.current.sheet).toEqual({kind: 'setup'});
    });

    it('enters after setup completes and memory fits', async () => {
      runInAction(() => {
        asrStore.downloadStates.base = 'not_installed';
      });
      const {enter, hook, engine} = renderVoiceMode();
      await enter();

      runInAction(() => {
        asrStore.downloadStates.base = 'ready';
      });
      await act(async () => {
        await hook.result.current.setupDone();
      });

      expect(hook.result.current.sheet).toBeNull();
      expect(engine.prepare).toHaveBeenCalledTimes(1);
      expect(voiceModeStore.phase).toBe('listening');
    });

    it.each([
      [
        'the model was ejected',
        () => {
          model.activeModelId = undefined;
        },
        1,
      ],
      [
        'the model is still loading',
        () => {
          model.isContextLoading = true;
        },
        0,
      ],
    ])(
      'does not enter after setup when %s meanwhile',
      async (_case, arrange, pickerOpens) => {
        runInAction(() => {
          asrStore.downloadStates.base = 'not_installed';
        });
        const {enter, hook, engine} = renderVoiceMode();
        await enter();

        runInAction(() => {
          asrStore.downloadStates.base = 'ready';
          arrange();
        });
        await act(async () => {
          await hook.result.current.setupDone();
        });

        expect(openModelPicker).toHaveBeenCalledTimes(pickerOpens);
        expect(engine.prepare).not.toHaveBeenCalled();
        expect(voiceModeStore.phase).toBe('closed');
      },
    );

    it('shows the teaser instead of entering after setup when voice mode locked meanwhile', async () => {
      runInAction(() => {
        asrStore.downloadStates.base = 'not_installed';
      });
      const {enter, hook, engine} = renderVoiceMode();
      await enter();

      runInAction(() => {
        asrStore.downloadStates.base = 'ready';
      });
      voiceModeStore.setUnlockOverride(false);
      await act(async () => {
        await hook.result.current.setupDone();
      });

      expect(hook.result.current.sheet).toEqual({kind: 'teaser'});
      expect(engine.prepare).not.toHaveBeenCalled();
    });

    it('enters a local model with a held first chunk, a keep-awake hold and an open mic', async () => {
      const {enter, engine} = renderVoiceMode();

      await enter();

      expect(ttsStore.setVoiceOutputActive).toHaveBeenCalledWith(true, {
        holdFirstChunk: true,
      });
      expect(ttsStore.stop).toHaveBeenCalled();
      expect(acquireKeepAwake).toHaveBeenCalledTimes(1);
      expect(engine.prepare).toHaveBeenCalledTimes(1);
      expect(voiceModeStore.phase).toBe('listening');
      expect(voiceModeStore.presentation).toBe('full');
      expect(AudioRecord.start).toHaveBeenCalledTimes(1);
    });

    it('shows the starting state at once, while speech recognition loads', async () => {
      const {engine, hook} = renderVoiceMode();
      let loaded!: () => void;
      engine.prepare.mockReturnValueOnce(
        new Promise<void>(resolve => {
          loaded = resolve;
        }),
      );

      let entering!: Promise<void>;
      act(() => {
        entering = hook.result.current.requestEntry(actions);
      });
      await flush();
      expect(voiceModeStore.phase).toBe('starting');
      expect(voiceModeStore.presentation).toBe('full');
      expect(AudioRecord.init).not.toHaveBeenCalled();

      await act(async () => {
        loaded();
        await entering;
      });
      expect(voiceModeStore.phase).toBe('listening');
    });

    it('a failed load closes the session and releases everything, without the mic', async () => {
      const {engine, enter} = renderVoiceMode();
      engine.prepare.mockRejectedValueOnce(new Error('load'));
      jest.spyOn(console, 'warn').mockImplementationOnce(() => {});

      await enter();
      await flush();

      expect(voiceModeStore.phase).toBe('closed');
      const release = (acquireKeepAwake as jest.Mock).mock.results[0].value;
      expect(release).toHaveBeenCalledTimes(1);
      expect(ttsStore.setVoiceOutputActive).toHaveBeenLastCalledWith(false);
      expect(AudioRecord.init).not.toHaveBeenCalled();
      expect(uiStore.setChatWarning).toHaveBeenCalledWith(
        expect.objectContaining({message: uiStore.l10n.voiceMode.startFailed}),
      );
    });

    it('End while loading keeps the session closed and the mic off once the load finishes', async () => {
      const {engine, hook} = renderVoiceMode();
      let loaded!: () => void;
      engine.prepare.mockReturnValueOnce(
        new Promise<void>(resolve => {
          loaded = resolve;
        }),
      );
      let entering!: Promise<void>;
      act(() => {
        entering = hook.result.current.requestEntry(actions);
      });
      await flush();

      await act(async () => {
        await hook.result.current.end();
      });
      await act(async () => {
        loaded();
        await entering;
      });

      expect(voiceModeStore.phase).toBe('closed');
      expect(AudioRecord.init).not.toHaveBeenCalled();
      expect(AudioRecord.start).not.toHaveBeenCalled();
    });

    it('gives up with a warning when loading takes too long', async () => {
      jest.useFakeTimers();
      const {engine, hook} = renderVoiceMode();
      engine.prepare.mockReturnValueOnce(new Promise<void>(() => {}));
      jest.spyOn(console, 'warn').mockImplementationOnce(() => {});

      act(() => {
        hook.result.current.requestEntry(actions);
      });
      await act(async () => {});
      expect(voiceModeStore.phase).toBe('starting');

      await act(async () => {
        jest.advanceTimersByTime(VOICE_START_TIMEOUT_MS);
      });
      jest.useRealTimers();

      expect(voiceModeStore.phase).toBe('closed');
      expect(uiStore.setChatWarning).toHaveBeenCalledWith(
        expect.objectContaining({message: uiStore.l10n.voiceMode.startFailed}),
      );
    });

    it('holds nothing back for a remote model', async () => {
      const remote = {...localModel, id: 'remote', origin: ModelOrigin.REMOTE};
      runInAction(() => {
        model.models = [...modelsList, remote];
        model.activeModelId = 'remote';
      });
      const {enter} = renderVoiceMode();

      await enter();

      expect(ttsStore.setVoiceOutputActive).toHaveBeenCalledWith(true, {
        holdFirstChunk: false,
      });
    });

    it('shows the memory sheet when memory is tight; Continue anyway enters', async () => {
      runInAction(() => {
        model.loadedModelBytes =
          5e9 * ASR_IOS_CEILING_SHARE -
          ASR_TIERS.base.runtimeBytes -
          TTS_ENGINE_RUNTIME_BYTES.supertonic / 2;
      });
      const {enter, hook, engine} = renderVoiceMode();

      await enter();
      expect(hook.result.current.sheet).toMatchObject({
        kind: 'memory',
        fit: {status: 'tight'},
      });
      expect(engine.prepare).not.toHaveBeenCalled();

      await act(async () => {
        await hook.result.current.continueAnyway();
      });
      expect(voiceModeStore.phase).toBe('listening');
      expect(hook.result.current.sheet).toBeNull();
      expect(engine.prepare).toHaveBeenCalledWith('base');
    });

    describe('with Small in use', () => {
      const tightFor = (tier: 'base' | 'small') =>
        5e9 * ASR_IOS_CEILING_SHARE -
        ASR_TIERS[tier].runtimeBytes -
        TTS_ENGINE_RUNTIME_BYTES.supertonic / 2;

      beforeEach(() => {
        runInAction(() => {
          asrStore.selectedTier = 'small';
          asrStore.downloadStates.small = 'ready';
        });
      });

      it('prepares Small', async () => {
        const {enter, engine} = renderVoiceMode();
        await enter();
        expect(engine.prepare).toHaveBeenCalledWith('small');
      });

      it('opens setup when Small is not installed, even with base ready', async () => {
        runInAction(() => {
          asrStore.downloadStates.small = 'not_installed';
        });
        const {enter, hook, engine} = renderVoiceMode();
        await enter();
        expect(hook.result.current.sheet).toEqual({kind: 'setup'});
        expect(engine.prepare).not.toHaveBeenCalled();
      });

      it("budgets Small's memory and names it on the memory sheet", async () => {
        runInAction(() => {
          model.loadedModelBytes = tightFor('small');
        });
        const {enter, hook} = renderVoiceMode();
        await enter();
        expect(hook.result.current.sheet).toMatchObject({
          kind: 'memory',
          fit: {status: 'tight', sttTier: 'small'},
        });
        const sheet = hook.result.current.sheet;
        expect(
          sheet?.kind === 'memory' && sheet.fit.breakdown.rows,
        ).toContainEqual({kind: 'stt', bytes: ASR_TIERS.small.runtimeBytes});
      });

      it('Continue anyway re-checks entry when the tier changed under the sheet', async () => {
        runInAction(() => {
          model.loadedModelBytes = tightFor('small');
        });
        const {enter, hook, engine} = renderVoiceMode();
        await enter();
        runInAction(() => {
          asrStore.downloadStates['large-turbo'] = 'ready';
          asrStore.selectedTier = 'large-turbo';
        });

        await act(async () => {
          await hook.result.current.continueAnyway();
        });

        expect(hook.result.current.sheet).toMatchObject({
          kind: 'memory',
          fit: {sttTier: 'large-turbo'},
        });
        expect(engine.prepare).not.toHaveBeenCalled();
      });

      it('Continue anyway re-checks entry when the tier is no longer installed', async () => {
        runInAction(() => {
          model.loadedModelBytes = tightFor('small');
        });
        const {enter, hook, engine} = renderVoiceMode();
        await enter();
        runInAction(() => {
          asrStore.downloadStates.small = 'not_installed';
        });

        await act(async () => {
          await hook.result.current.continueAnyway();
        });

        expect(hook.result.current.sheet).toEqual({kind: 'setup'});
        expect(engine.prepare).not.toHaveBeenCalled();
      });

      it('Continue anyway enters with Small when nothing changed', async () => {
        runInAction(() => {
          model.loadedModelBytes = tightFor('small');
        });
        const {enter, hook, engine} = renderVoiceMode();
        await enter();

        await act(async () => {
          await hook.result.current.continueAnyway();
        });

        expect(engine.prepare).toHaveBeenCalledWith('small');
        expect(voiceModeStore.phase).toBe('listening');
      });
    });

    describe('when the model changed while the memory sheet was open', () => {
      const openTightSheet = async () => {
        runInAction(() => {
          model.loadedModelBytes =
            5e9 * ASR_IOS_CEILING_SHARE -
            ASR_TIERS.base.runtimeBytes -
            TTS_ENGINE_RUNTIME_BYTES.supertonic / 2;
        });
        const rendered = renderVoiceMode();
        await rendered.enter();
        expect(rendered.hook.result.current.sheet).toMatchObject({
          fit: {status: 'tight'},
        });
        return rendered;
      };

      it('Continue anyway opens the model picker once the model is gone', async () => {
        const {hook, engine} = await openTightSheet();
        runInAction(() => {
          model.activeModelId = undefined;
        });

        await act(async () => {
          await hook.result.current.continueAnyway();
        });

        expect(openModelPicker).toHaveBeenCalledTimes(1);
        expect(hook.result.current.sheet).toBeNull();
        expect(engine.prepare).not.toHaveBeenCalled();
        expect(voiceModeStore.phase).toBe('closed');
      });

      it('Continue anyway does not enter while the model is loading', async () => {
        const {hook, engine} = await openTightSheet();
        runInAction(() => {
          model.isContextLoading = true;
        });

        await act(async () => {
          await hook.result.current.continueAnyway();
        });

        expect(hook.result.current.sheet).toBeNull();
        expect(engine.prepare).not.toHaveBeenCalled();
        expect(voiceModeStore.phase).toBe('closed');
      });
    });

    it("won't enter on Continue anyway when whisper won't fit", async () => {
      runInAction(() => {
        model.loadedModelBytes = 5e9;
      });
      const {enter, hook, engine} = renderVoiceMode();

      await enter();
      expect(hook.result.current.sheet).toMatchObject({
        fit: {status: 'wont_fit'},
      });
      await act(async () => {
        await hook.result.current.continueAnyway();
      });

      expect(engine.prepare).not.toHaveBeenCalled();
    });

    it('Choose a smaller model opens the picker and stays closed', async () => {
      runInAction(() => {
        model.loadedModelBytes =
          5e9 * ASR_IOS_CEILING_SHARE -
          ASR_TIERS.base.runtimeBytes -
          TTS_ENGINE_RUNTIME_BYTES.supertonic / 2;
      });
      const {enter, hook} = renderVoiceMode();
      await enter();

      act(() => hook.result.current.chooseSmallerModel());

      expect(openModelPicker).toHaveBeenCalledTimes(1);
      expect(hook.result.current.sheet).toBeNull();
      expect(voiceModeStore.phase).toBe('closed');
    });
  });

  describe('a turn', () => {
    it('endpoints after speech and a pause, with the mic stopped until the turn ends', async () => {
      const {enter, engine, turns} = renderVoiceMode();
      await enter();

      speak(500);
      speak(600, SILENT);

      expect(voiceModeStore.phase).toBe('transcribing');
      expect(AudioRecord.stop).toHaveBeenCalledTimes(1);
      expect(engine.runTurn).toHaveBeenCalledTimes(1);
      expect(turns[0].utterance.length).toBeGreaterThan(0);

      act(() => turns[0].on.transcribed('hi'));
      expect(voiceModeStore.phase).toBe('thinking');
      act(() => turns[0].on.speechStarted());
      expect(voiceModeStore.phase).toBe('speaking');
      expect(AudioRecord.start).toHaveBeenCalledTimes(1);

      turns[0].finish('answered');
      await flush();
      await settleMic();

      expect(voiceModeStore.phase).toBe('listening');
      expect(voiceModeStore.lastError).toBeNull();
      expect(AudioRecord.start).toHaveBeenCalledTimes(2);
    });

    it('after an empty turn, starts the mic again only once the old one has settled', async () => {
      const {enter, turns} = renderVoiceMode();
      await enter();
      speak(500);
      speak(600, SILENT);
      expect(AudioRecord.init).toHaveBeenCalledTimes(1);

      turns[0].finish('empty');
      await flush();
      expect(voiceModeStore.phase).toBe('listening');
      expect(AudioRecord.init).toHaveBeenCalledTimes(1);

      await settleMic();
      expect(AudioRecord.init).toHaveBeenCalledTimes(2);
      expect(AudioRecord.start).toHaveBeenCalledTimes(2);
      const stopOrder = (AudioRecord.stop as jest.Mock).mock
        .invocationCallOrder[0];
      const initOrder = (AudioRecord.init as jest.Mock).mock
        .invocationCallOrder[1];
      expect(stopOrder).toBeLessThan(initOrder);
    });

    it('shows the failure and listens again', async () => {
      const {enter, turns} = renderVoiceMode();
      await enter();
      speak(500);
      speak(600, SILENT);

      turns[0].finish('reply_failed');
      await flush();

      expect(voiceModeStore.phase).toBe('listening');
      expect(voiceModeStore.lastError).toBe('reply_failed');
    });

    it('a tap while listening ends the utterance only after speech', async () => {
      const {enter, hook, engine} = renderVoiceMode();
      await enter();

      speak(200, SILENT);
      act(() => hook.result.current.tapCloud());
      expect(engine.runTurn).not.toHaveBeenCalled();

      speak(400);
      act(() => hook.result.current.tapCloud());
      expect(engine.runTurn).toHaveBeenCalledTimes(1);
    });

    it('a tap while speaking interrupts the reply and listens again', async () => {
      const {enter, hook, turns} = renderVoiceMode();
      await enter();
      speak(500);
      speak(600, SILENT);
      act(() => turns[0].on.transcribed('hi'));
      act(() => turns[0].on.speechStarted());

      act(() => hook.result.current.tapCloud());

      expect(turns[0].interrupt).toHaveBeenCalledTimes(1);
      await flush();
      expect(voiceModeStore.phase).toBe('listening');
    });

    it.each(['transcribing', 'thinking'] as const)(
      'a tap while %s cancels the turn and listens again',
      async phase => {
        const {enter, hook, turns} = renderVoiceMode();
        await enter();
        speak(500);
        speak(600, SILENT);
        if (phase === 'thinking') {
          act(() => turns[0].on.transcribed('hi'));
        }
        expect(voiceModeStore.phase).toBe(phase);

        act(() => hook.result.current.tapCloud());

        expect(turns[0].interrupt).toHaveBeenCalledTimes(1);
        await flush();
        expect(voiceModeStore.phase).toBe('listening');
      },
    );

    it('a phase forced from outside starts no capture', async () => {
      renderVoiceMode();

      act(() => {
        runInAction(() => {
          voiceModeStore.phase = 'listening';
        });
      });

      expect(AudioRecord.init).not.toHaveBeenCalled();
      expect(AudioRecord.start).not.toHaveBeenCalled();
    });
  });

  describe('mute', () => {
    it('stops the mic while listening and resumes on unmute', async () => {
      const {enter, hook, engine} = renderVoiceMode();
      await enter();

      act(() => hook.result.current.toggleMute());
      expect(voiceModeStore.micMuted).toBe(true);
      expect(AudioRecord.stop).toHaveBeenCalledTimes(1);

      act(() => hook.result.current.tapCloud());
      expect(engine.runTurn).not.toHaveBeenCalled();

      await act(async () => hook.result.current.toggleMute());
      await settleMic();
      expect(AudioRecord.start).toHaveBeenCalledTimes(2);
    });

    const enterSlowly = async () => {
      const voice = renderVoiceMode();
      let loaded!: () => void;
      voice.engine.prepare.mockReturnValueOnce(
        new Promise<void>(resolve => {
          loaded = resolve;
        }),
      );
      let entering!: Promise<void>;
      act(() => {
        entering = voice.hook.result.current.requestEntry(actions);
      });
      await flush();
      expect(voiceModeStore.phase).toBe('starting');
      const finishLoading = () =>
        act(async () => {
          loaded();
          await entering;
        });
      return {...voice, finishLoading};
    };

    it('muted while starting, listens with the mic off once loaded', async () => {
      const {hook, finishLoading} = await enterSlowly();

      act(() => hook.result.current.toggleMute());
      await finishLoading();

      expect(voiceModeStore.phase).toBe('listening');
      expect(voiceModeStore.micMuted).toBe(true);
      expect(AudioRecord.init).not.toHaveBeenCalled();
    });

    it('muted then unmuted while starting, opens the mic once loaded', async () => {
      const {hook, finishLoading} = await enterSlowly();

      act(() => hook.result.current.toggleMute());
      act(() => hook.result.current.toggleMute());
      await finishLoading();

      expect(voiceModeStore.micMuted).toBe(false);
      expect(AudioRecord.start).toHaveBeenCalledTimes(1);
    });

    it('while speaking leaves the mic off after the turn', async () => {
      const {enter, hook, turns} = renderVoiceMode();
      await enter();
      speak(500);
      speak(600, SILENT);
      act(() => turns[0].on.speechStarted());

      act(() => hook.result.current.toggleMute());
      turns[0].finish('answered');
      await flush();

      expect(voiceModeStore.phase).toBe('listening');
      expect(voiceModeStore.micMuted).toBe(true);
      expect(AudioRecord.start).toHaveBeenCalledTimes(1);
    });
  });

  describe('exits', () => {
    const expectClosedAndReleased = (engine: {release: jest.Mock}) => {
      expect(voiceModeStore.phase).toBe('closed');
      expect(engine.release).toHaveBeenCalledTimes(1);
      const release = (acquireKeepAwake as jest.Mock).mock.results[0].value;
      expect(release).toHaveBeenCalledTimes(1);
      expect(ttsStore.setVoiceOutputActive).toHaveBeenLastCalledWith(false);
    };

    it.each([
      [
        'End',
        (h: any) =>
          act(() => {
            h.result.current.end();
          }),
      ],
      ['the app going to the background', () => setAppState('background')],
      ['leaving the screen', () => act(() => mockBlur?.())],
      [
        'a chat switch',
        () =>
          act(() => {
            chatSessionStore.activeSessionId = 'session-2';
          }),
      ],
      [
        'a model change',
        () =>
          act(() => {
            runInAction(() => {
              model.activeModelId = modelsList[1].id;
            });
          }),
      ],
      ['unmount', (h: any) => h.unmount()],
    ])(
      '%s while speaking interrupts the turn and releases everything',
      async (_case, trigger) => {
        const {enter, hook, engine, turns} = renderVoiceMode();
        await enter();
        speak(500);
        speak(600, SILENT);
        act(() => turns[0].on.speechStarted());

        trigger(hook);
        await flush();

        expect(turns[0].interrupt).toHaveBeenCalledTimes(1);
        expectClosedAndReleased(engine);
      },
    );

    it.each([
      ['transcribing', 'transcribing', () => {}],
      [
        'thinking',
        'thinking',
        (turn: FakeTurn) => act(() => turn.on.transcribed('hello')),
      ],
    ])(
      'End while %s interrupts the turn and releases everything',
      async (_case, phase, arrange) => {
        const {enter, hook, engine, turns} = renderVoiceMode();
        await enter();
        speak(500);
        speak(600, SILENT);
        arrange(turns[0]);
        expect(voiceModeStore.phase).toBe(phase);

        await act(async () => {
          await hook.result.current.end();
        });

        expect(turns[0].interrupt).toHaveBeenCalledTimes(1);
        expectClosedAndReleased(engine);
      },
    );

    it('frees the models only once the JS thread is idle', async () => {
      const idle: Array<() => void> = [];
      const original = (global as any).requestIdleCallback;
      (global as any).requestIdleCallback = (callback: () => void) =>
        idle.push(callback);
      const {enter, hook, engine} = renderVoiceMode();
      await enter();

      act(() => {
        hook.result.current.end();
      });
      await flush();
      expect(voiceModeStore.phase).toBe('closed');
      expect(engine.release).not.toHaveBeenCalled();

      await act(async () => {
        idle.forEach(callback => callback());
      });
      expect(engine.release).toHaveBeenCalledTimes(1);
      (global as any).requestIdleCallback = original;
    });

    it('stops speaking replies at End, before the models are freed', async () => {
      const idle: Array<() => void> = [];
      const original = (global as any).requestIdleCallback;
      (global as any).requestIdleCallback = (callback: () => void) =>
        idle.push(callback);
      runInAction(() => {
        tts.autoSpeakEnabled = false;
      });
      const {enter, hook, engine} = renderVoiceMode();
      await enter();
      expect(ttsStore.streamsReplies).toBe(true);

      act(() => {
        hook.result.current.end();
      });
      await flush();

      expect(engine.release).not.toHaveBeenCalled();
      expect(ttsStore.streamsReplies).toBe(false);
      await act(async () => {
        idle.forEach(callback => callback());
      });
      (global as any).requestIdleCallback = original;
    });

    it('a quick re-entry checks memory only once the last session freed its models', async () => {
      const idle: Array<() => void> = [];
      const original = (global as any).requestIdleCallback;
      (global as any).requestIdleCallback = (callback: () => void) =>
        idle.push(callback);
      Platform.OS = 'android';
      (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValue(16e9);
      const {enter, hook, engine} = renderVoiceMode();
      await enter();
      act(() => {
        hook.result.current.end();
      });
      await flush();
      (DeviceInfo.getTotalMemory as jest.Mock).mockClear();

      let reentering!: Promise<void>;
      act(() => {
        reentering = hook.result.current.requestEntry(actions);
      });
      await flush();
      expect(DeviceInfo.getTotalMemory).not.toHaveBeenCalled();

      await act(async () => {
        idle.forEach(callback => callback());
        await reentering;
      });
      expect(engine.release).toHaveBeenCalledTimes(1);
      expect(DeviceInfo.getTotalMemory).toHaveBeenCalledTimes(1);
      (global as any).requestIdleCallback = original;
    });

    it('End while listening stops the mic', async () => {
      const {enter, hook, engine} = renderVoiceMode();
      await enter();

      await act(async () => {
        await hook.result.current.end();
      });

      expect(AudioRecord.stop).toHaveBeenCalledTimes(1);
      expectClosedAndReleased(engine);
    });

    it('a microphone that fails ends the session', async () => {
      (AudioRecord.init as jest.Mock).mockRejectedValueOnce(new Error('mic'));
      jest.spyOn(console, 'warn').mockImplementationOnce(() => {});
      const {enter, engine} = renderVoiceMode();

      await enter();
      await flush();

      expectClosedAndReleased(engine);
      expect(uiStore.setChatWarning).toHaveBeenCalledWith(
        expect.objectContaining({
          message: uiStore.l10n.voiceMode.micFailed,
          context: 'chat',
        }),
      );
    });

    it('keeps the voice hold through a turn', async () => {
      const {enter, turns} = renderVoiceMode();
      await enter();
      speak(500);
      speak(600, SILENT);
      turns[0].finish('answered');
      await flush();

      const release = (acquireKeepAwake as jest.Mock).mock.results[0].value;
      expect(release).not.toHaveBeenCalled();
    });
  });

  it('stays open when the first spoken turn of a new chat creates its session', async () => {
    runInAction(() => {
      chatSessionStore.activeSessionId = undefined as any;
    });
    const {enter, engine, turns} = renderVoiceMode();
    await enter();
    speak(500);
    speak(600, SILENT);
    expect(turns).toHaveLength(1);
    port.send.mockImplementationOnce(
      (_text: string, onTurnCreated: (id: string) => void) =>
        new Promise<void>(() => {
          chatSessionStore.activeSessionId = 'session-created-by-send';
          onTurnCreated('turn-1');
        }),
    );

    act(() => {
      turns[0].port.send('hello', jest.fn());
    });
    await flush();

    expect(turns[0].interrupt).not.toHaveBeenCalled();
    expect(engine.release).not.toHaveBeenCalled();
    expect(voiceModeStore.phase).not.toBe('closed');
  });

  it('closes when a new chat switches to an existing chat while transcribing', async () => {
    runInAction(() => {
      chatSessionStore.activeSessionId = undefined as any;
    });
    const {enter, engine, turns} = renderVoiceMode();
    await enter();
    speak(500);
    speak(600, SILENT);
    expect(voiceModeStore.phase).toBe('transcribing');

    act(() => {
      chatSessionStore.activeSessionId = 'session-1';
    });
    await flush();

    expect(voiceModeStore.phase).toBe('closed');
    expect(turns[0].interrupt).toHaveBeenCalledTimes(1);
    expect(engine.release).toHaveBeenCalledTimes(1);
    expect(port.send).not.toHaveBeenCalled();
  });

  it("closes on a chat switch once the new chat's turn row exists", async () => {
    runInAction(() => {
      chatSessionStore.activeSessionId = undefined as any;
    });
    const {enter, turns} = renderVoiceMode();
    await enter();
    speak(500);
    speak(600, SILENT);
    port.send.mockImplementationOnce(
      (_text: string, onTurnCreated: (id: string) => void) =>
        new Promise<void>(() => {
          chatSessionStore.activeSessionId = 'session-created-by-send';
          onTurnCreated('turn-1');
        }),
    );
    act(() => {
      turns[0].port.send('hello', jest.fn());
    });
    await flush();

    act(() => {
      chatSessionStore.activeSessionId = 'session-1';
    });
    await flush();

    expect(voiceModeStore.phase).toBe('closed');
    expect(turns[0].interrupt).toHaveBeenCalledTimes(1);
  });

  it('closes when a new chat switches to another chat with no turn running', async () => {
    runInAction(() => {
      chatSessionStore.activeSessionId = undefined as any;
    });
    const {enter, engine} = renderVoiceMode();
    await enter();

    act(() => {
      chatSessionStore.activeSessionId = 'session-2';
    });
    await flush();

    expect(voiceModeStore.phase).toBe('closed');
    expect(engine.release).toHaveBeenCalledTimes(1);
  });

  it('leaves auto-speak and the speech overrides untouched across a session', async () => {
    runInAction(() => {
      tts.autoSpeakEnabled = false;
      tts.userTTSOverride = false;
      (asrStore as any).userASROverride = false;
    });
    const {enter, hook, turns} = renderVoiceMode();
    await enter();
    speak(500);
    speak(600, SILENT);
    act(() => turns[0].on.transcribed('hello'));
    act(() => turns[0].on.speechStarted());
    turns[0].finish('answered');
    await flush();
    await act(async () => {
      await hook.result.current.end();
    });

    expect(tts.autoSpeakEnabled).toBe(false);
    expect(tts.userTTSOverride).toBe(false);
    expect((asrStore as any).userASROverride).toBe(false);
    expect(ttsStore.setAutoSpeak).not.toHaveBeenCalled();
    expect(ttsStore.setUserTTSOverride).not.toHaveBeenCalled();
    expect(asrStore.setUserASROverride).not.toHaveBeenCalled();
    runInAction(() => {
      tts.userTTSOverride = null;
      (asrStore as any).userASROverride = null;
    });
  });

  describe('a mic that delivers no audio', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    const advance = (ms: number) =>
      act(async () => {
        jest.advanceTimersByTime(ms);
      });

    it('is restarted once, then voice mode ends with a warning', async () => {
      jest.useFakeTimers();
      const {enter, engine} = renderVoiceMode();
      await enter();

      await advance(2500);
      expect(AudioRecord.init).toHaveBeenCalledTimes(1);

      await advance(VOICE_MIC_WATCHDOG_MS - 2500);
      await advance(VOICE_CAPTURE_SETTLE_MS);
      expect(AudioRecord.init).toHaveBeenCalledTimes(2);
      expect(voiceModeStore.phase).toBe('listening');

      await advance(VOICE_MIC_WATCHDOG_MS);
      expect(voiceModeStore.phase).toBe('closed');
      expect(engine.release).toHaveBeenCalledTimes(1);
      expect(uiStore.setChatWarning).toHaveBeenCalledWith(
        expect.objectContaining({message: uiStore.l10n.voiceMode.micFailed}),
      );
    });

    it('gets a fresh restart after the user mutes and unmutes', async () => {
      jest.useFakeTimers();
      const {enter, hook} = renderVoiceMode();
      await enter();
      await advance(VOICE_MIC_WATCHDOG_MS);
      await advance(VOICE_CAPTURE_SETTLE_MS);
      expect(AudioRecord.init).toHaveBeenCalledTimes(2);

      act(() => hook.result.current.toggleMute());
      await act(async () => hook.result.current.toggleMute());
      await advance(VOICE_CAPTURE_SETTLE_MS);
      expect(AudioRecord.init).toHaveBeenCalledTimes(3);

      await advance(VOICE_MIC_WATCHDOG_MS);
      await advance(VOICE_CAPTURE_SETTLE_MS);
      expect(voiceModeStore.phase).toBe('listening');
      expect(AudioRecord.init).toHaveBeenCalledTimes(4);
    });

    it('is left alone once audio arrives', async () => {
      jest.useFakeTimers();
      const {enter} = renderVoiceMode();
      await enter();

      speak(100, SILENT);
      await advance(VOICE_MIC_WATCHDOG_MS * 3);

      expect(AudioRecord.init).toHaveBeenCalledTimes(1);
      expect(voiceModeStore.phase).toBe('listening');
    });
  });

  describe('audio interruptions', () => {
    const interruption = (type: 'began' | 'ended') => {
      const calls = (onAudioInterruption as jest.Mock).mock.calls;
      act(() => calls[calls.length - 1][0]({type}));
    };

    it('stop the mic while listening and restart it when they end', async () => {
      const {enter} = renderVoiceMode();
      await enter();

      interruption('began');
      expect(AudioRecord.stop).toHaveBeenCalledTimes(1);

      interruption('ended');
      await settleMic();
      expect(AudioRecord.start).toHaveBeenCalledTimes(2);
      expect(voiceModeStore.phase).toBe('listening');
    });

    it('while listening, pause with the mic off and no watchdog until ended', async () => {
      jest.useFakeTimers();
      try {
        const {enter} = renderVoiceMode();
        await enter();
        interruption('began');
        expect(voiceModeStore.micMuted).toBe(true);

        await act(async () => {
          jest.advanceTimersByTime(60_000);
        });
        expect(AudioRecord.init).toHaveBeenCalledTimes(1);
        expect(voiceModeStore.phase).toBe('listening');

        interruption('ended');
        await act(async () => {
          jest.advanceTimersByTime(VOICE_CAPTURE_SETTLE_MS);
        });
        expect(voiceModeStore.micMuted).toBe(false);
        expect(AudioRecord.start).toHaveBeenCalledTimes(2);
        expect(voiceModeStore.phase).toBe('listening');
      } finally {
        jest.useRealTimers();
      }
    });

    it('a began while the mic is reopening keeps it closed until the next ended', async () => {
      jest.useFakeTimers();
      try {
        const {enter} = renderVoiceMode();
        await enter();
        interruption('began');
        interruption('ended');
        interruption('began');
        await act(async () => {
          jest.advanceTimersByTime(VOICE_MIC_WATCHDOG_MS * 3);
        });
        expect(AudioRecord.init).toHaveBeenCalledTimes(1);
        expect(voiceModeStore.phase).toBe('listening');

        interruption('ended');
        await act(async () => {
          jest.advanceTimersByTime(VOICE_CAPTURE_SETTLE_MS);
        });
        expect(AudioRecord.init).toHaveBeenCalledTimes(2);
      } finally {
        jest.useRealTimers();
      }
    });

    it('two restarts that overlap open the mic once', async () => {
      const {enter} = renderVoiceMode();
      await enter();
      interruption('began');

      interruption('ended');
      interruption('ended');
      await settleMic();
      await flush();

      expect(AudioRecord.init).toHaveBeenCalledTimes(2);
      expect(AudioRecord.start).toHaveBeenCalledTimes(2);
    });

    describe.each(['transcribing', 'thinking', 'speaking'] as const)(
      'while %s',
      phase => {
        const interruptTurn = async () => {
          const rendered = renderVoiceMode();
          await rendered.enter();
          speak(500);
          speak(600, SILENT);
          const [turn] = rendered.turns;
          if (phase !== 'transcribing') {
            act(() => turn.on.transcribed('hi'));
          }
          if (phase === 'speaking') {
            act(() => turn.on.speechStarted());
          }
          expect(voiceModeStore.phase).toBe(phase);

          interruption('began');
          await flush();
          await settleMic();
          return rendered;
        };

        it('end the turn like a tap and listen with the mic paused', async () => {
          const {turns} = await interruptTurn();

          expect(turns[0].interrupt).toHaveBeenCalledTimes(1);
          expect(port.stop).not.toHaveBeenCalled();
          expect(voiceModeStore.phase).toBe('listening');
          expect(voiceModeStore.micMuted).toBe(true);
          expect(AudioRecord.start).toHaveBeenCalledTimes(1);
        });

        it('reopen the mic when they end', async () => {
          await interruptTurn();

          interruption('ended');
          await settleMic();

          expect(voiceModeStore.micMuted).toBe(false);
          expect(AudioRecord.start).toHaveBeenCalledTimes(2);
        });

        it('reopen the mic on a cloud tap', async () => {
          const {hook, engine} = await interruptTurn();

          act(() => hook.result.current.tapCloud());
          await settleMic();

          expect(voiceModeStore.micMuted).toBe(false);
          expect(AudioRecord.start).toHaveBeenCalledTimes(2);
          expect(engine.runTurn).toHaveBeenCalledTimes(1);
        });

        it('reopen the mic when the app becomes active', async () => {
          await interruptTurn();

          setAppState('active');
          await settleMic();

          expect(voiceModeStore.micMuted).toBe(false);
          expect(AudioRecord.start).toHaveBeenCalledTimes(2);
        });
      },
    );

    it('while speaking, one that ends before the turn finishes opens the mic once it does', async () => {
      const {enter, turns} = renderVoiceMode();
      await enter();
      speak(500);
      speak(600, SILENT);
      act(() => turns[0].on.speechStarted());
      turns[0].interrupt.mockImplementation(async () => {});

      interruption('began');
      interruption('ended');
      await settleMic();
      expect(AudioRecord.start).toHaveBeenCalledTimes(1);

      turns[0].finish('interrupted');
      await flush();
      await settleMic();
      expect(voiceModeStore.micMuted).toBe(false);
      expect(AudioRecord.start).toHaveBeenCalledTimes(2);
    });

    it('while speaking with the mic muted, leave it muted after they end', async () => {
      const {enter, hook, turns} = renderVoiceMode();
      await enter();
      speak(500);
      speak(600, SILENT);
      act(() => turns[0].on.speechStarted());
      act(() => hook.result.current.toggleMute());

      interruption('began');
      interruption('ended');
      await flush();
      await settleMic();

      expect(turns[0].interrupt).toHaveBeenCalledTimes(1);
      expect(voiceModeStore.micMuted).toBe(true);
      expect(AudioRecord.start).toHaveBeenCalledTimes(1);
    });

    it('while listening with no ended event, unmuting opens the mic again', async () => {
      const {enter, hook} = renderVoiceMode();
      await enter();
      interruption('began');

      await act(async () => hook.result.current.toggleMute());
      await settleMic();

      expect(AudioRecord.start).toHaveBeenCalledTimes(2);
    });

    it('while listening with no ended event, returning to the app opens the mic again', async () => {
      const {enter} = renderVoiceMode();
      await enter();
      interruption('began');

      setAppState('inactive');
      setAppState('active');
      await settleMic();

      expect(AudioRecord.start).toHaveBeenCalledTimes(2);
      expect(voiceModeStore.micMuted).toBe(false);
    });

    it('while listening with no ended event, the app becoming active opens the mic again', async () => {
      const {enter} = renderVoiceMode();
      await enter();
      interruption('began');

      setAppState('active');
      await settleMic();

      expect(AudioRecord.start).toHaveBeenCalledTimes(2);
    });

    it('while listening with no ended event, a cloud tap opens the mic again', async () => {
      const {enter, hook} = renderVoiceMode();
      await enter();
      interruption('began');

      act(() => hook.result.current.tapCloud());
      await settleMic();

      expect(AudioRecord.start).toHaveBeenCalledTimes(2);
      expect(voiceModeStore.micMuted).toBe(false);
      expect(voiceModeStore.phase).toBe('listening');
    });

    it('a muted mic stays off when one ends', async () => {
      const {enter, hook} = renderVoiceMode();
      await enter();
      act(() => hook.result.current.toggleMute());
      interruption('began');
      interruption('ended');
      await settleMic();

      expect(voiceModeStore.micMuted).toBe(true);
      expect(AudioRecord.start).toHaveBeenCalledTimes(1);
    });

    it('ending voice mode while paused closes it', async () => {
      const {enter, hook} = renderVoiceMode();
      await enter();
      interruption('began');

      await act(async () => {
        await hook.result.current.end();
      });
      interruption('ended');
      await settleMic();

      expect(voiceModeStore.phase).toBe('closed');
      expect(voiceModeStore.micMuted).toBe(false);
      expect(AudioRecord.start).toHaveBeenCalledTimes(1);
    });

    const enterSlowly = () => {
      const {engine, hook} = renderVoiceMode();
      let loaded!: () => void;
      engine.prepare.mockReturnValueOnce(
        new Promise<void>(resolve => {
          loaded = resolve;
        }),
      );
      let entering!: Promise<void>;
      act(() => {
        entering = hook.result.current.requestEntry(actions);
      });
      const finishLoading = () =>
        act(async () => {
          loaded();
          await entering;
        });
      return {finishLoading};
    };

    it('during starting, pause; once loaded stay listening with the mic off until ended', async () => {
      jest.useFakeTimers();
      try {
        const {finishLoading} = enterSlowly();
        await flush();

        interruption('began');
        await finishLoading();

        expect(voiceModeStore.phase).toBe('listening');
        expect(voiceModeStore.micMuted).toBe(true);
        expect(AudioRecord.start).not.toHaveBeenCalled();

        await act(async () => {
          jest.advanceTimersByTime(60_000);
        });
        expect(voiceModeStore.phase).toBe('listening');
        expect(AudioRecord.start).not.toHaveBeenCalled();

        interruption('ended');
        await act(async () => {
          jest.advanceTimersByTime(VOICE_CAPTURE_SETTLE_MS);
        });
        expect(voiceModeStore.micMuted).toBe(false);
        expect(AudioRecord.start).toHaveBeenCalledTimes(1);
        expect(voiceModeStore.phase).toBe('listening');
      } finally {
        jest.useRealTimers();
      }
    });

    it('began and ended both during starting open the mic once loaded', async () => {
      const {finishLoading} = enterSlowly();
      await flush();

      interruption('began');
      interruption('ended');
      await finishLoading();
      await settleMic();

      expect(voiceModeStore.phase).toBe('listening');
      expect(voiceModeStore.micMuted).toBe(false);
      expect(AudioRecord.start).toHaveBeenCalledTimes(1);
    });

    it('are not followed once the chat screen is gone', async () => {
      const {hook} = renderVoiceMode();
      const subscription = (onAudioInterruption as jest.Mock).mock.results[0]
        .value;
      hook.unmount();
      expect(subscription.remove).toHaveBeenCalledTimes(1);
    });
  });

  it('restarts capture on return from inactive while listening', async () => {
    const {enter} = renderVoiceMode();
    await enter();

    setAppState('inactive');
    setAppState('active');
    await settleMic();

    expect(voiceModeStore.phase).toBe('listening');
    expect(AudioRecord.stop).toHaveBeenCalledTimes(1);
    expect(AudioRecord.start).toHaveBeenCalledTimes(2);
  });
});
