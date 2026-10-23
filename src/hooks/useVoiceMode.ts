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
import type {VoiceError, VoicePhase} from '../store';
import {acquireKeepAwake} from '../utils/keepAwake';
import {ModelOrigin} from '../utils/types';
import {startVoiceTrace, vtrace} from '../utils/voiceTrace';

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
  private pausedByInterruption = false;
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
    if (this.entryBlocked()) {
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
    if (this.entryBlocked()) {
      return;
    }
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

  async continueAnyway(): Promise<void> {
    await this.exiting;
    this.showSheet(null);
    if (!this.entryBlocked()) {
      await this.enter();
    }
  }

  private entryBlocked(): boolean {
    if (!voiceModeStore.isUnlocked) {
      this.showSheet({kind: 'teaser'});
      return true;
    }
    if (!modelStore.activeModelId) {
      this.actions.openModelPicker();
      return true;
    }
    return modelStore.isContextLoading;
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
    const {focusInput} = this.actions;
    requestAnimationFrame(() => focusInput());
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
    startVoiceTrace();
    ttsStore.setVoiceOutputActive(true, {
      holdFirstChunk: modelStore.activeModel?.origin !== ModelOrigin.REMOTE,
    });
    ttsStore.stop('voice_enter').catch(() => {});
    this.releaseAwake = acquireKeepAwake();
    this.setPhase('starting', 'enter');
    voiceModeStore.setPresentation('full');
    try {
      await withStartTimeout(this.engine.prepare());
    } catch (err) {
      console.warn('[voiceMode] prepare failed:', err);
      if (session === this.session) {
        warn(uiStore.l10n.voiceMode.startFailed);
        this.exit('start_failed');
      }
      return;
    }
    if (session !== this.session) {
      return;
    }
    this.setPhase('listening', 'ready');
    this.startCapture(session);
  }

  /** The chat screen is mounted: sessions may start. */
  attach(): void {
    this.disposed = false;
  }

  /** The chat screen is gone: end any session and start no other until attached. */
  dispose(): void {
    this.disposed = true;
    this.exit('dispose');
  }

  exit(reason: string): Promise<void> {
    if (!this.open) {
      return this.exiting ?? Promise.resolve();
    }
    this.open = false;
    this.session++;
    this.micRetried = false;
    this.pausedByInterruption = false;
    this.setPhase('closed', reason);
    this.stopCapture();
    const turn = this.turn;
    this.turn = null;
    this.exiting = (async () => {
      try {
        if (turn) {
          vtrace('interrupt', {src: 'exit'});
          await turn.interrupt();
        }
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
    vtrace('tap', {phase, speech: this.endpointer.hasSpeech});
    if (this.pausedByInterruption) {
      this.resumeAfterInterruption('tap');
    } else if (phase === 'listening' && this.endpointer.tap()) {
      this.endUtterance(this.session, 'tap');
    } else if (
      phase === 'transcribing' ||
      phase === 'thinking' ||
      phase === 'speaking'
    ) {
      vtrace('interrupt', {src: 'tap', phase, turn: !!this.turn});
      this.turn?.interrupt();
    }
  }

  toggleMute(): void {
    const muted = !voiceModeStore.micMuted;
    voiceModeStore.setMicMuted(muted);
    this.pausedByInterruption = false;
    if (voiceModeStore.phase !== 'listening') {
      return;
    }
    if (muted) {
      this.stopCapture();
    } else {
      this.micRetried = false;
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
      this.exit('background');
    } else if (next === 'active' && this.pausedByInterruption) {
      this.resumeAfterInterruption('foreground');
    } else if (
      next === 'active' &&
      previous === 'inactive' &&
      voiceModeStore.phase === 'listening'
    ) {
      vtrace('mic.restart', {why: 'foreground'});
      this.stopCapture();
      this.startCapture(this.session);
    }
  }

  /**
   * A call, alarm or Siri took the audio session: stop the mic and any turn,
   * and show the mic as off until `ended`, a cloud tap, the app becoming
   * active, or unmute. `ended` may never come (Android only holds focus while
   * a chunk plays; iOS skips it after Siri and often after a call), and the
   * session holding it can last minutes, so no watchdog runs meanwhile.
   */
  onAudioInterruption({type}: AudioInterruptionProps): void {
    vtrace('audio.int', {type, open: this.open, phase: voiceModeStore.phase});
    if (!this.open) {
      return;
    }
    if (type === 'began') {
      this.stopCapture();
      if (this.turn) {
        vtrace('interrupt', {src: 'audio_interruption'});
        this.turn.interrupt();
      }
      if (
        (this.turn ||
          voiceModeStore.phase === 'listening' ||
          voiceModeStore.phase === 'starting') &&
        !voiceModeStore.micMuted
      ) {
        this.pausedByInterruption = true;
        voiceModeStore.setMicMuted(true);
      }
      return;
    }
    if (this.pausedByInterruption) {
      this.resumeAfterInterruption('interruption_ended');
    } else if (voiceModeStore.phase === 'listening') {
      vtrace('mic.restart', {why: 'interruption_ended'});
      this.stopCapture();
      this.startCapture(this.session);
    }
  }

  private resumeAfterInterruption(why: string): void {
    vtrace('mic.restart', {why});
    this.pausedByInterruption = false;
    this.micRetried = false;
    voiceModeStore.setMicMuted(false);
    this.stopCapture();
    this.startCapture(this.session);
  }

  private setPhase(phase: VoicePhase, reason: string): void {
    vtrace('phase', {to: phase, from: voiceModeStore.phase, r: reason});
    voiceModeStore.setPhase(phase);
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
    this.clearMicWatchdog();
    vtrace('mic.watch');
    this.micWatchdog = setTimeout(() => {
      this.micWatchdog = null;
      if (session !== this.session) {
        return;
      }
      vtrace('mic.watch.fire', {retried: this.micRetried});
      if (this.micRetried) {
        console.warn('[voiceMode] microphone delivered no audio');
        warn(uiStore.l10n.voiceMode.micFailed);
        this.exit('mic_silent');
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
          this.endUtterance(session, 'auto');
        }
      });
      AudioRecord.start();
      vtrace('mic.open');
      this.watchMic(session);
    } catch (err) {
      console.warn('[voiceMode] microphone failed:', err);
      vtrace('mic.fail', {err: String(err)});
      if (session === this.session) {
        warn(uiStore.l10n.voiceMode.micFailed);
        this.exit('mic_failed');
      }
    }
  }

  private clearMicWatchdog(): void {
    if (this.micWatchdog) {
      vtrace('mic.watch.clear');
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
    vtrace('mic.close');
    Promise.resolve(AudioRecord.stop()).catch(() => {});
    this.holdMic(VOICE_CAPTURE_SETTLE_MS);
  }

  /** The next mic start waits at least `ms` from now. */
  private holdMic(ms: number): void {
    const held = new Promise<void>(resolve => setTimeout(resolve, ms));
    this.captureSettled = Promise.all([this.captureSettled, held]).then(
      () => {},
    );
  }

  private endUtterance(session: number, by: 'auto' | 'tap'): void {
    vtrace('utt.end', {by, voicedMs: this.endpointer.voicedMs});
    const utterance = this.endpointer.take();
    this.stopCapture();
    this.setPhase('transcribing', by);
    const current = () => session === this.session;
    const turn = this.engine.runTurn(utterance, this.turnPort, {
      transcribed: () => current() && this.setPhase('thinking', 'transcribed'),
      speechStarted: () =>
        current() && this.setPhase('speaking', 'speech_started'),
    });
    this.turn = turn;
    turn.done
      .catch((): VoiceTurnOutcome => 'reply_failed')
      .then(outcome => {
        vtrace('turn.done', {outcome, current: current()});
        if (!current()) {
          return;
        }
        this.turn = null;
        this.setPhase('listening', outcome);
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
        vtrace('app', {from: previous, to: next});
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
          controller.exit('chat_changed');
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
        setSheet(current => (current?.kind === 'teaser' ? null : current));
        controller.exit('blur');
      },
      [controller],
    ),
  );

  const continueAnyway = useCallback(async () => {
    if (sheet?.kind === 'memory' && sheet.fit.status === 'tight') {
      await controller.continueAnyway();
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
    end: useCallback(() => controller.exit('end'), [controller]),
  };
}
