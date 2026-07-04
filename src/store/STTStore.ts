/**
 * STTStore — MobX state management for Speech-to-Text.
 *
 * Mirrors the TTSStore pattern:
 * - makeAutoObservable with autoBind
 * - makePersistable for user preferences
 * - runInAction for async state updates
 * - Singleton export
 *
 * Architecture (ADR-2026-003): Local-first STT.
 * - Primary: Whisper.cpp (offline)
 * - Fallback: System Speech API
 */

import {makeAutoObservable, runInAction} from 'mobx';
import {makePersistable} from 'mobx-persist-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {sttRuntime} from '../services/stt/sttRuntime';
import {getEngine} from '../services/stt/engineRegistry';
import type {STTResult, STTEngineId} from '../services/stt/types';

export type STTStatus = 'idle' | 'listening' | 'processing' | 'error';

class STTStore {
  /** Current recognition status. */
  status: STTStatus = 'idle';

  /** Partial (interim) transcription while listening. */
  partialText: string = '';

  /** Last completed transcription. */
  finalText: string = '';

  /** Last error message. */
  errorMessage: string = '';

  /** Whether STT is enabled (user preference). */
  enabled: boolean = true;

  /** Preferred engine id. null = auto-select. */
  preferredEngine: STTEngineId | null = null;

  /** Whether STT setup sheet is visible. */
  isSetupSheetOpen: boolean = false;

  /** Whether the whisper model is loaded. */
  whisperModelLoaded: boolean = false;

  private initialized: boolean = false;

  constructor() {
    makeAutoObservable(this, {}, {autoBind: true});
    makePersistable(this, {
      name: 'STTStore',
      properties: ['enabled', 'preferredEngine'],
      storage: AsyncStorage,
    });
  }

  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    // Register engines
    const {registerSTTEngines} = await import('../services/stt/engineRegistry');
    registerSTTEngines();

    // Check whisper model status
    const whisper = getEngine('whisper');
    if (whisper && (await whisper.isAvailable())) {
      runInAction(() => {
        this.whisperModelLoaded = true;
      });
    }
  }

  /** Whether STT is currently available (any engine). */
  get isSTTAvailable(): boolean {
    return this.status !== 'error' || this.enabled;
  }

  /** Whether recognition is currently active. */
  get isListening(): boolean {
    return this.status === 'listening';
  }

  /**
   * Start speech recognition.
   * Updates status and text fields as recognition progresses.
   */
  async startListening(language?: string): Promise<void> {
    if (!this.enabled) {
      return;
    }
    if (this.status === 'listening') {
      return;
    }

    runInAction(() => {
      this.status = 'listening';
      this.partialText = '';
      this.finalText = '';
      this.errorMessage = '';
    });

    try {
      await sttRuntime.start(
        {
          onStart: () => {
            runInAction(() => {
              this.status = 'listening';
            });
          },
          onPartial: (text: string) => {
            runInAction(() => {
              this.partialText = text;
            });
          },
          onResult: (result: STTResult) => {
            runInAction(() => {
              this.finalText = result.text;
              this.partialText = '';
              this.status = 'idle';
            });
          },
          onError: (error: Error) => {
            runInAction(() => {
              this.status = 'error';
              this.errorMessage = error.message;
            });
          },
          onEnd: () => {
            runInAction(() => {
              if (this.status === 'listening') {
                this.status = 'idle';
              }
            });
          },
        },
        {language, enablePartial: true},
      );
    } catch (e) {
      runInAction(() => {
        this.status = 'error';
        this.errorMessage = e instanceof Error ? e.message : String(e);
      });
    }
  }

  /**
   * Stop listening and get the final result.
   */
  async stopListening(): Promise<string> {
    await sttRuntime.stop();
    return this.finalText;
  }

  /**
   * Cancel listening and discard results.
   */
  async cancelListening(): Promise<void> {
    await sttRuntime.cancel();
    runInAction(() => {
      this.status = 'idle';
      this.partialText = '';
    });
  }

  /**
   * Toggle listening on/off.
   */
  async toggleListening(language?: string): Promise<void> {
    if (this.status === 'listening') {
      await this.stopListening();
    } else {
      await this.startListening(language);
    }
  }

  /** Enable STT. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled && this.status === 'listening') {
      this.cancelListening();
    }
  }

  /** Set preferred engine. */
  setPreferredEngine(engine: STTEngineId | null): void {
    this.preferredEngine = engine;
  }

  /** Open/close setup sheet. */
  setSetupSheetOpen(open: boolean): void {
    this.isSetupSheetOpen = open;
  }

  /** Clear the final text. */
  clearText(): void {
    this.finalText = '';
    this.partialText = '';
  }

  /** Reset error state. */
  clearError(): void {
    if (this.status === 'error') {
      this.status = 'idle';
    }
    this.errorMessage = '';
  }
}

export const sttStore = new STTStore();
