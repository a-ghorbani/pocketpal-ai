import {useCallback, useEffect, useState} from 'react';
import {AppState, Platform, type AppStateStatus} from 'react-native';

import {toByteArray} from 'base64-js';
import {comparer, reaction} from 'mobx';
import {useFocusEffect} from '@react-navigation/native';
import AudioRecord from '@fugood/react-native-audio-pcm-stream';
import DeviceInfo from 'react-native-device-info';

import {
  ASR_BITS_PER_SAMPLE,
  ASR_CHANNELS,
  ASR_CHUNK_BYTES,
  ASR_SAMPLE_RATE,
  ASR_TIERS,
} from '../services/asr';
import type {DeviceMemory} from '../services/asr';
import {TTS_ENGINE_RUNTIME_BYTES, ttsRuntime} from '../services/tts';
import {
  Endpointer,
  isMicGranted,
  isVoiceModeVoice,
  voiceMemoryFit,
} from '../services/voice';
import type {
  VoiceEngine,
  VoiceMemoryFit,
  VoiceTurn,
  VoiceTurnOutcome,
  VoiceTurnPort,
} from '../services/voice';
import {CascadeVoiceEngine} from '../services/voice/cascadeEngine';
import {
  asrStore,
  chatSessionStore,
  modelStore,
  ttsStore,
  voiceEntitlement,
  voiceModeStore,
} from '../store';
import type {VoiceError} from '../store';
import NativeHardwareInfo from '../specs/NativeHardwareInfo';
import {acquireKeepAwake} from '../utils/keepAwake';
import {ModelOrigin} from '../utils/types';

export type VoiceModeSheet =
  | {kind: 'setup'}
  | {kind: 'memory'; fit: VoiceMemoryFit}
  | null;

const FAILURES: Partial<Record<VoiceTurnOutcome, VoiceError>> = {
  transcribe_failed: 'transcribe_failed',
  reply_failed: 'reply_failed',
  speech_failed: 'speech_failed',
};

async function readDeviceMemory(): Promise<DeviceMemory | null> {
  try {
    return Platform.OS === 'ios'
      ? {
          os: 'ios',
          availableBytes: await NativeHardwareInfo.getAvailableMemory(),
        }
      : {os: 'android', totalBytes: await DeviceInfo.getTotalMemory()};
  } catch (err) {
    console.warn('[voiceMode] memory check failed:', err);
    return null;
  }
}

async function isSetupComplete(): Promise<boolean> {
  return (
    asrStore.downloadStates.base === 'ready' &&
    isVoiceModeVoice(ttsStore.currentVoice) &&
    (await isMicGranted())
  );
}

/**
 * One voice session at a time: entry checks, the listening loop, turns, and
 * every way the session ends. `session` changes on each entry and exit, so a
 * continuation from an earlier session does nothing.
 */
class VoiceModeController {
  port: VoiceTurnPort;
  private open = false;
  private session = 0;
  private exiting: Promise<void> | null = null;
  private releaseAwake: (() => void) | null = null;
  private turn: VoiceTurn | null = null;
  private readonly endpointer = new Endpointer();
  private listener: {remove(): void} | null = null;
  private openModelPicker: () => void = () => {};
  private sendingToNewChat = false;
  private readonly turnPort: VoiceTurnPort = {
    send: (text, onTurnCreated) => {
      this.sendingToNewChat = chatSessionStore.activeSessionId == null;
      return this.port
        .send(text, turnId => {
          this.sendingToNewChat = false;
          onTurnCreated(turnId);
        })
        .finally(() => {
          this.sendingToNewChat = false;
        });
    },
    stop: () => this.port.stop(),
  };

  constructor(
    private readonly engine: VoiceEngine,
    port: VoiceTurnPort,
    private readonly showSheet: (sheet: VoiceModeSheet) => void,
  ) {
    this.port = port;
  }

  async requestEntry(openModelPicker: () => void): Promise<void> {
    if (this.open) {
      return;
    }
    this.openModelPicker = openModelPicker;
    if (!voiceModeStore.isUnlocked) {
      voiceEntitlement.source.openPaywall();
      return;
    }
    if (!modelStore.activeModelId) {
      openModelPicker();
      return;
    }
    if (modelStore.isContextLoading) {
      return;
    }
    if (!(await isSetupComplete())) {
      this.showSheet({kind: 'setup'});
      return;
    }
    await this.checkMemoryAndEnter();
  }

  async checkMemoryAndEnter(): Promise<void> {
    const voice = ttsStore.currentVoice;
    if (!isVoiceModeVoice(voice)) {
      this.showSheet({kind: 'setup'});
      return;
    }
    const fit = voiceMemoryFit({
      memory: await readDeviceMemory(),
      chatBytes: modelStore.loadedModelBytes ?? 0,
      sttBytes: ASR_TIERS.base.runtimeBytes,
      ttsBytes: TTS_ENGINE_RUNTIME_BYTES[voice.engine],
      ttsLoaded: ttsRuntime.getActiveEngineId() === voice.engine,
    });
    if (fit.status === 'fits') {
      await this.enter();
    } else {
      this.showSheet({kind: 'memory', fit});
    }
  }

  /**
   * True from a send in a chat that has no session yet until its turn row
   * exists: the session that appears meanwhile is the one this send created.
   */
  get isCreatingChat(): boolean {
    return this.sendingToNewChat;
  }

  chooseSmallerModel(): void {
    this.showSheet(null);
    this.openModelPicker();
  }

  async enter(): Promise<void> {
    await this.exiting;
    if (this.open) {
      return;
    }
    this.showSheet(null);
    this.open = true;
    const session = ++this.session;
    ttsStore.setVoiceOutputActive(true, {
      holdFirstChunk: modelStore.activeModel?.origin !== ModelOrigin.REMOTE,
    });
    ttsStore.stop().catch(() => {});
    this.releaseAwake = acquireKeepAwake();
    try {
      await this.engine.prepare();
    } catch (err) {
      console.warn('[voiceMode] prepare failed:', err);
      if (session === this.session) {
        this.exit();
      }
      return;
    }
    if (session !== this.session) {
      return;
    }
    voiceModeStore.setPhase('listening');
    voiceModeStore.setPresentation('full');
    this.startCapture(session);
  }

  exit(): Promise<void> {
    if (!this.open) {
      return this.exiting ?? Promise.resolve();
    }
    this.open = false;
    this.session++;
    voiceModeStore.setPhase('closed');
    this.stopCapture();
    const turn = this.turn;
    this.turn = null;
    this.exiting = (async () => {
      try {
        await turn?.interrupt();
      } catch (err) {
        console.warn('[voiceMode] interrupt on exit failed:', err);
      }
      try {
        await this.engine.release();
      } catch (err) {
        console.warn('[voiceMode] release failed:', err);
      }
      this.releaseAwake?.();
      this.releaseAwake = null;
      ttsStore.setVoiceOutputActive(false);
    })();
    return this.exiting;
  }

  tapCloud(): void {
    const phase = voiceModeStore.phase;
    if (phase === 'listening' && this.endpointer.tap()) {
      this.endUtterance(this.session);
    } else if (phase === 'speaking') {
      this.turn?.interrupt();
    }
  }

  toggleMute(): void {
    const muted = !voiceModeStore.micMuted;
    voiceModeStore.setMicMuted(muted);
    if (voiceModeStore.phase !== 'listening') {
      return;
    }
    if (muted) {
      this.stopCapture();
    } else {
      this.startCapture(this.session);
    }
  }

  onAppStateChange(
    previous: string | null | undefined,
    next: AppStateStatus,
  ): void {
    if (!this.open) {
      return;
    }
    if (next === 'background') {
      this.exit();
    } else if (
      next === 'active' &&
      previous === 'inactive' &&
      voiceModeStore.phase === 'listening'
    ) {
      this.stopCapture();
      this.startCapture(this.session);
    }
  }

  private isListening(session: number): boolean {
    return (
      session === this.session &&
      voiceModeStore.phase === 'listening' &&
      !voiceModeStore.micMuted
    );
  }

  private async startCapture(session: number): Promise<void> {
    if (!this.isListening(session) || this.listener) {
      return;
    }
    try {
      await AudioRecord.init({
        sampleRate: ASR_SAMPLE_RATE,
        channels: ASR_CHANNELS,
        bitsPerSample: ASR_BITS_PER_SAMPLE,
        bufferSize: ASR_CHUNK_BYTES,
        wavFile: '',
      });
      if (!this.isListening(session) || this.listener) {
        return;
      }
      this.endpointer.reset();
      this.listener = AudioRecord.on('data', (chunk: string) => {
        if (
          this.listener &&
          this.endpointer.push(toByteArray(chunk)) === 'endpoint'
        ) {
          this.endUtterance(session);
        }
      });
      AudioRecord.start();
    } catch (err) {
      console.warn('[voiceMode] microphone failed:', err);
      if (session === this.session) {
        this.exit();
      }
    }
  }

  private stopCapture(): void {
    this.endpointer.reset();
    if (!this.listener) {
      return;
    }
    this.listener.remove();
    this.listener = null;
    Promise.resolve(AudioRecord.stop()).catch(() => {});
  }

  private endUtterance(session: number): void {
    const utterance = this.endpointer.take();
    this.stopCapture();
    voiceModeStore.setPhase('transcribing');
    const current = () => session === this.session;
    const turn = this.engine.runTurn(utterance, this.turnPort, {
      transcribed: () => current() && voiceModeStore.setPhase('thinking'),
      speechStarted: () => current() && voiceModeStore.setPhase('speaking'),
    });
    this.turn = turn;
    turn.done
      .catch((): VoiceTurnOutcome => 'reply_failed')
      .then(outcome => {
        if (!current()) {
          return;
        }
        this.turn = null;
        voiceModeStore.setPhase('listening');
        const error = FAILURES[outcome];
        if (error) {
          voiceModeStore.setLastError(error);
        }
        this.startCapture(session);
      });
  }
}

/**
 * The single controller of a hands-free voice session in chat, mounted once
 * per chat screen. It alone writes the session phase, mute and error.
 */
export function useVoiceMode({
  port,
  engine,
}: {
  port: VoiceTurnPort;
  engine?: VoiceEngine;
}) {
  const [sheet, setSheet] = useState<VoiceModeSheet>(null);
  const [controller] = useState(
    () =>
      new VoiceModeController(
        engine ?? new CascadeVoiceEngine(),
        port,
        setSheet,
      ),
  );
  controller.port = port;

  useEffect(() => {
    let appState = AppState.currentState;
    const subscription = AppState.addEventListener(
      'change',
      (next: AppStateStatus) => {
        const previous = appState;
        appState = next;
        controller.onAppStateChange(previous, next);
      },
    );
    const disposeChatWatch = reaction(
      () => [
        chatSessionStore.activeSessionId,
        modelStore.activeModelId,
        modelStore.contextId,
      ],
      (
        [sessionId, modelId, contextId],
        [prevSessionId, prevModelId, prevContextId],
      ) => {
        const sessionCreatedBySend =
          prevSessionId == null &&
          sessionId != null &&
          modelId === prevModelId &&
          contextId === prevContextId &&
          controller.isCreatingChat;
        if (!sessionCreatedBySend) {
          controller.exit();
        }
      },
      {equals: comparer.structural},
    );
    return () => {
      subscription.remove();
      disposeChatWatch();
      controller.exit();
    };
  }, [controller]);

  useFocusEffect(
    useCallback(
      () => () => {
        controller.exit();
      },
      [controller],
    ),
  );

  const continueAnyway = useCallback(async () => {
    if (sheet?.kind === 'memory' && sheet.fit.status === 'tight') {
      await controller.enter();
    }
  }, [controller, sheet]);

  return {
    requestEntry: useCallback(
      ({openModelPicker}: {openModelPicker: () => void}) =>
        controller.requestEntry(openModelPicker),
      [controller],
    ),
    sheet,
    setupDone: useCallback(() => {
      setSheet(null);
      return controller.checkMemoryAndEnter();
    }, [controller]),
    continueAnyway,
    chooseSmallerModel: useCallback(
      () => controller.chooseSmallerModel(),
      [controller],
    ),
    dismissSheet: useCallback(() => setSheet(null), []),
    tapCloud: useCallback(() => controller.tapCloud(), [controller]),
    toggleMute: useCallback(() => controller.toggleMute(), [controller]),
    end: useCallback(() => controller.exit(), [controller]),
  };
}
