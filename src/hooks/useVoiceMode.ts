import {useCallback, useEffect, useState} from 'react';
import {AppState, type AppStateStatus} from 'react-native';

import {toByteArray} from 'base64-js';
import {comparer, reaction} from 'mobx';
import {useFocusEffect} from '@react-navigation/native';
import AudioRecord from '@fugood/react-native-audio-pcm-stream';
import {
  onAudioInterruption,
  type AudioInterruptionProps,
} from '@pocketpalai/react-native-speech';

import {
  ASR_BITS_PER_SAMPLE,
  ASR_CHANNELS,
  ASR_CHUNK_BYTES,
  ASR_SAMPLE_RATE,
  ASR_TIERS,
  readDeviceMemory,
} from '../services/asr';
import {TTS_ENGINE_RUNTIME_BYTES} from '../services/tts';
import {
  Endpointer,
  VOICE_CAPTURE_SETTLE_MS,
  VOICE_MIC_WATCHDOG_MS,
  VOICE_START_TIMEOUT_MS,
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
  uiStore,
  voiceEntitlement,
  voiceModeStore,
} from '../store';
import type {VoiceError} from '../store';
import {acquireKeepAwake} from '../utils/keepAwake';
import {ModelOrigin} from '../utils/types';

export type VoiceModeSheet =
  | {kind: 'teaser'}
  | {kind: 'setup'}
  | {kind: 'memory'; fit: VoiceMemoryFit}
  | null;

/** What the chat hands voice mode for the ways out of entry. */
export interface VoiceEntryActions {
  openModelPicker: () => void;
  focusInput: () => void;
}

const noop = () => {};

const FAILURES: Partial<Record<VoiceTurnOutcome, VoiceError>> = {
  transcribe_failed: 'transcribe_failed',
  reply_failed: 'reply_failed',
  speech_failed: 'speech_failed',
};

const warn = (message: string) =>
  uiStore.setChatWarning({
    code: 'unknown',
    message,
    context: 'chat',
    recoverable: true,
    severity: 'error',
  });

const withStartTimeout = (loading: Promise<void>): Promise<void> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('voice mode took too long to start')),
      VOICE_START_TIMEOUT_MS,
    );
  });
  return Promise.race([loading, timeout]).finally(() => clearTimeout(timer));
};

async function isSetupComplete(): Promise<boolean> {
  return (
    asrStore.downloadStates.base === 'ready' &&
    isVoiceModeVoice(ttsStore.currentVoice) &&
    (await isMicGranted())
  );
}

/**
 * One voice session at a time: entry checks, the listening loop, turns, and
 * the exits it can detect itself. ChatScreen also ends the session through
 * `exit` when a video Pal takes over. `session` changes on each entry and
 * exit, so a continuation from an earlier session does nothing.
 */
class VoiceModeController {
  port: VoiceTurnPort;
  private open = false;
  private disposed = false;
  private session = 0;
  private exiting: Promise<void> | null = null;
  private releaseAwake: (() => void) | null = null;
  private turn: VoiceTurn | null = null;
  private readonly endpointer = new Endpointer();
  private listener: {remove(): void} | null = null;
  private captureSettled: Promise<void> = Promise.resolve();
  private micStarting: Promise<void> | null = null;
  private micWatchdog: ReturnType<typeof setTimeout> | null = null;
  private micRetried = false;
  private actions: VoiceEntryActions = {
    openModelPicker: noop,
    focusInput: noop,
  };
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

  async requestEntry(actions: VoiceEntryActions): Promise<void> {
    if (this.open || this.disposed) {
      return;
    }
    this.actions = actions;
    if (!voiceModeStore.isUnlocked) {
      this.showSheet({kind: 'teaser'});
      return;
    }
    if (!modelStore.activeModelId) {
      actions.openModelPicker();
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
    await this.exiting;
    const voice = ttsStore.currentVoice;
    if (!isVoiceModeVoice(voice)) {
      this.showSheet({kind: 'setup'});
      return;
    }
    const fit = voiceMemoryFit({
      memory: await readDeviceMemory(modelStore),
      chatBytes: modelStore.loadedModelBytes ?? 0,
      sttBytes: ASR_TIERS.base.runtimeBytes,
      ttsBytes: TTS_ENGINE_RUNTIME_BYTES[voice.engine],
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

  getPlus(): void {
    this.showSheet(null);
    const actions = this.actions;
    voiceEntitlement.source.openPaywall({
      onUnlocked: () => this.requestEntry(actions),
    });
  }

  keepTyping(): void {
    this.showSheet(null);
    this.actions.focusInput();
  }

  chooseSmallerModel(): void {
    this.showSheet(null);
    this.actions.openModelPicker();
  }

  async enter(): Promise<void> {
    await this.exiting;
    if (this.open || this.disposed) {
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
    voiceModeStore.setPhase('starting');
    voiceModeStore.setPresentation('full');
    try {
      await withStartTimeout(this.engine.prepare());
    } catch (err) {
      console.warn('[voiceMode] prepare failed:', err);
      if (session === this.session) {
        warn(uiStore.l10n.voiceMode.startFailed);
        this.exit();
      }
      return;
    }
    if (session !== this.session) {
      return;
    }
    voiceModeStore.setPhase('listening');
    this.startCapture(session);
  }

  /** The chat screen is mounted: sessions may start. */
  attach(): void {
    this.disposed = false;
  }

  /** The chat screen is gone: end any session and start no other until attached. */
  dispose(): void {
    this.disposed = true;
    this.exit();
  }

  exit(): Promise<void> {
    if (!this.open) {
      return this.exiting ?? Promise.resolve();
    }
    this.open = false;
    this.session++;
    this.micRetried = false;
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
      ttsStore.setVoiceOutputActive(false);
      try {
        // Freeing the models blocks the JS thread; let a scroll start first.
        await new Promise<void>(resolve =>
          requestIdleCallback(() => resolve()),
        );
        await this.engine.release();
      } catch (err) {
        console.warn('[voiceMode] release failed:', err);
      }
      this.releaseAwake?.();
      this.releaseAwake = null;
    })();
    return this.exiting;
  }

  tapCloud(): void {
    const phase = voiceModeStore.phase;
    if (phase === 'listening' && this.endpointer.tap()) {
      this.endUtterance(this.session);
    } else if (
      phase === 'transcribing' ||
      phase === 'thinking' ||
      phase === 'speaking'
    ) {
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

  /**
   * A call, alarm or Siri took the audio session: stop the mic and any turn.
   * `ended` may never come (Android only holds focus while a chunk plays),
   * so the next move into listening opens the mic again; while already
   * listening, the watchdog retries it, then ends the session if it is
   * still taken.
   */
  onAudioInterruption({type}: AudioInterruptionProps): void {
    if (!this.open) {
      return;
    }
    if (type === 'began') {
      this.stopCapture();
      if (this.turn) {
        this.turn.interrupt();
      } else if (voiceModeStore.phase === 'listening') {
        this.watchMic(this.session);
      }
      return;
    }
    if (voiceModeStore.phase === 'listening') {
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

  /** No audio since the mic started: restart it once, then give up. */
  private watchMic(session: number): void {
    this.micWatchdog = setTimeout(() => {
      this.micWatchdog = null;
      if (session !== this.session) {
        return;
      }
      if (this.micRetried) {
        console.warn('[voiceMode] microphone delivered no audio');
        warn(uiStore.l10n.voiceMode.micFailed);
        this.exit();
        return;
      }
      this.micRetried = true;
      this.stopCapture();
      this.startCapture(session);
    }, VOICE_MIC_WATCHDOG_MS);
  }

  private async startCapture(session: number): Promise<void> {
    while (this.micStarting) {
      await this.micStarting;
    }
    const starting = this.openMic(session);
    this.micStarting = starting;
    try {
      await starting;
    } finally {
      if (this.micStarting === starting) {
        this.micStarting = null;
      }
    }
  }

  private async openMic(session: number): Promise<void> {
    if (!this.isListening(session) || this.listener) {
      return;
    }
    await this.captureSettled;
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
        if (!this.listener) {
          return;
        }
        this.clearMicWatchdog();
        this.micRetried = false;
        if (this.endpointer.push(toByteArray(chunk)) === 'endpoint') {
          this.endUtterance(session);
        }
      });
      AudioRecord.start();
      this.watchMic(session);
    } catch (err) {
      console.warn('[voiceMode] microphone failed:', err);
      if (session === this.session) {
        warn(uiStore.l10n.voiceMode.micFailed);
        this.exit();
      }
    }
  }

  private clearMicWatchdog(): void {
    if (this.micWatchdog) {
      clearTimeout(this.micWatchdog);
      this.micWatchdog = null;
    }
  }

  private stopCapture(): void {
    this.clearMicWatchdog();
    this.endpointer.reset();
    if (!this.listener) {
      return;
    }
    this.listener.remove();
    this.listener = null;
    Promise.resolve(AudioRecord.stop()).catch(() => {});
    this.captureSettled = new Promise(resolve =>
      setTimeout(resolve, VOICE_CAPTURE_SETTLE_MS),
    );
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
    controller.attach();
    const interruptions = onAudioInterruption(event =>
      controller.onAudioInterruption(event),
    );
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
      interruptions.remove();
      subscription.remove();
      disposeChatWatch();
      controller.dispose();
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
      (actions: VoiceEntryActions) => controller.requestEntry(actions),
      [controller],
    ),
    getPlus: useCallback(() => controller.getPlus(), [controller]),
    keepTyping: useCallback(() => controller.keepTyping(), [controller]),
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
