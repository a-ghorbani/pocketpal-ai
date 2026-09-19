import * as React from 'react';
import {
  AppState,
  DeviceEventEmitter,
  PermissionsAndroid,
  Platform,
} from 'react-native';

import NativeSpeechRecognition, {
  SpeechRecognitionCapability,
} from '../specs/NativeSpeechRecognition';
import {ttsStore} from '../store';

type DictationPhase = 'idle' | 'preparing' | 'listening' | 'finishing';

interface SpeechRecognitionEvent {
  requestId: string;
  type:
    | 'listening'
    | 'speech'
    | 'finishing'
    | 'partial'
    | 'final'
    | 'error'
    | 'cancelled';
  text?: string;
  code?: string;
}

interface UseSpeechRecognitionOptions {
  draft: string;
  contextKey: string;
  enabled: boolean;
  playbackActive: boolean;
  onFinalText: (text: string) => void;
}

const EVENT_NAME = 'speechRecognitionEvent';

const appendTranscript = (draft: string, transcript: string): string => {
  if (!draft) {
    return transcript;
  }
  if (/\s$/.test(draft)) {
    return `${draft}${transcript}`;
  }
  return `${draft} ${transcript}`;
};

const deviceLocale = (): string =>
  Intl.DateTimeFormat().resolvedOptions().locale || 'en-US';

export function useSpeechRecognition({
  draft,
  contextKey,
  enabled,
  playbackActive,
  onFinalText,
}: UseSpeechRecognitionOptions) {
  const [phase, setPhase] = React.useState<DictationPhase>('idle');
  const [partialText, setPartialText] = React.useState('');
  const [errorCode, setErrorCode] = React.useState<string | null>(null);
  const [capability, setCapability] =
    React.useState<SpeechRecognitionCapability | null>(null);
  const requestIdRef = React.useRef<string | null>(null);
  const draftAtStartRef = React.useRef('');
  const contextAtStartRef = React.useRef('');
  const finalCommittedRef = React.useRef(false);
  const mountedRef = React.useRef(true);
  const appStateRef = React.useRef(AppState.currentState);

  const locale = React.useMemo(deviceLocale, []);

  const refreshCapability = React.useCallback(async () => {
    if (Platform.OS !== 'android' || NativeSpeechRecognition == null) {
      return null;
    }
    try {
      const result = await NativeSpeechRecognition.getCapability(locale);
      if (mountedRef.current) {
        setCapability(result);
      }
      return result;
    } catch {
      if (mountedRef.current) {
        setErrorCode('NATIVE_MODULE_ERROR');
      }
      return null;
    }
  }, [locale]);

  const reset = React.useCallback(() => {
    requestIdRef.current = null;
    finalCommittedRef.current = false;
    setPhase('idle');
    setPartialText('');
  }, []);

  const cancel = React.useCallback(async () => {
    const requestId = requestIdRef.current;
    reset();
    if (requestId && NativeSpeechRecognition) {
      try {
        await NativeSpeechRecognition.cancel(requestId);
      } catch {
        // Native cancellation is idempotent; stale requests are already dead.
      }
    }
  }, [reset]);

  React.useEffect(() => {
    mountedRef.current = true;
    refreshCapability();
    return () => {
      mountedRef.current = false;
      const requestId = requestIdRef.current;
      requestIdRef.current = null;
      if (requestId && NativeSpeechRecognition) {
        NativeSpeechRecognition.cancel(requestId).catch(() => {});
      }
    };
  }, [refreshCapability]);

  React.useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }
    const subscription = DeviceEventEmitter.addListener(
      EVENT_NAME,
      (event: SpeechRecognitionEvent) => {
        if (event.requestId !== requestIdRef.current) {
          return;
        }
        if (event.type === 'listening' || event.type === 'speech') {
          setPhase('listening');
          return;
        }
        if (event.type === 'finishing') {
          setPhase('finishing');
          return;
        }
        if (event.type === 'partial') {
          setPartialText(event.text ?? '');
          return;
        }
        if (event.type === 'error') {
          setErrorCode(event.code ?? 'RECOGNITION_FAILED');
          reset();
          return;
        }
        if (event.type === 'cancelled') {
          reset();
          return;
        }
        if (
          event.type === 'final' &&
          !finalCommittedRef.current &&
          contextAtStartRef.current === contextKey
        ) {
          finalCommittedRef.current = true;
          const transcript = event.text?.trim();
          if (transcript) {
            onFinalText(appendTranscript(draftAtStartRef.current, transcript));
          }
          reset();
        }
      },
    );
    return () => subscription.remove();
  }, [contextKey, onFinalText, reset]);

  React.useEffect(() => {
    if (phase !== 'idle' && draft !== draftAtStartRef.current) {
      cancel();
    }
  }, [cancel, draft, phase]);

  React.useEffect(() => {
    if (phase !== 'idle' && contextAtStartRef.current !== contextKey) {
      cancel();
    }
  }, [cancel, contextKey, phase]);

  React.useEffect(() => {
    if (!enabled && phase !== 'idle') {
      cancel();
    }
  }, [cancel, enabled, phase]);

  React.useEffect(() => {
    if (playbackActive && (phase === 'listening' || phase === 'finishing')) {
      cancel();
    }
  }, [cancel, phase, playbackActive]);

  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active' && requestIdRef.current) {
        cancel();
      }
      if (state === 'active' && appStateRef.current !== 'active') {
        refreshCapability();
      }
      appStateRef.current = state;
    });
    return () => subscription.remove();
  }, [cancel, refreshCapability]);

  const start = React.useCallback(async () => {
    if (phase !== 'idle' || !enabled) {
      return;
    }
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    requestIdRef.current = requestId;
    draftAtStartRef.current = draft;
    contextAtStartRef.current = contextKey;
    finalCommittedRef.current = false;
    setErrorCode(null);
    setPhase('preparing');

    if (Platform.OS !== 'android') {
      setErrorCode('ANDROID_ONLY');
      reset();
      return;
    }
    if (NativeSpeechRecognition == null) {
      setErrorCode('NATIVE_MODULE_ERROR');
      reset();
      return;
    }

    const currentCapability = capability ?? (await refreshCapability());
    if (!mountedRef.current || requestIdRef.current !== requestId) {
      return;
    }
    if (!currentCapability?.sdkSupported) {
      setErrorCode('UNSUPPORTED_ANDROID');
      reset();
      return;
    }
    if (!currentCapability.available) {
      setErrorCode('ON_DEVICE_UNAVAILABLE');
      reset();
      return;
    }
    if (
      currentCapability.support === 'downloadable' ||
      currentCapability.support === 'pending'
    ) {
      setErrorCode(
        currentCapability.support === 'pending'
          ? 'LANGUAGE_PENDING'
          : 'LANGUAGE_DOWNLOAD_REQUIRED',
      );
      reset();
      return;
    }
    if (currentCapability.support === 'unsupported') {
      setErrorCode('LANGUAGE_UNSUPPORTED');
      reset();
      return;
    }

    const permission = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    );
    if (!mountedRef.current || requestIdRef.current !== requestId) {
      return;
    }
    if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
      setErrorCode(
        permission === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
          ? 'PERMISSION_BLOCKED'
          : 'PERMISSION_DENIED',
      );
      reset();
      return;
    }

    setPartialText('');
    try {
      await ttsStore.stopForDictation();
      if (requestIdRef.current !== requestId || !enabled) {
        await NativeSpeechRecognition.cancel(requestId).catch(() => {});
        reset();
        return;
      }
      await NativeSpeechRecognition.start(requestId, locale);
      if (requestIdRef.current === requestId) {
        setPhase('listening');
      }
    } catch (error: any) {
      if (requestIdRef.current === requestId) {
        setErrorCode(error?.code ?? 'RECOGNITION_FAILED');
        reset();
      }
    }
  }, [
    capability,
    contextKey,
    draft,
    enabled,
    locale,
    phase,
    refreshCapability,
    reset,
  ]);

  const finish = React.useCallback(async () => {
    const requestId = requestIdRef.current;
    if (!requestId || phase === 'finishing' || !NativeSpeechRecognition) {
      return;
    }
    setPhase('finishing');
    try {
      await NativeSpeechRecognition.stop(requestId);
    } catch (error: any) {
      if (requestIdRef.current === requestId) {
        setErrorCode(error?.code ?? 'RECOGNITION_FAILED');
        reset();
      }
    }
  }, [phase, reset]);

  const requestModelDownload = React.useCallback(async () => {
    if (!NativeSpeechRecognition) {
      return;
    }
    setErrorCode(null);
    try {
      await NativeSpeechRecognition.requestModelDownload(locale);
      await refreshCapability();
    } catch (error: any) {
      setErrorCode(error?.code ?? 'DOWNLOAD_FAILED');
    }
  }, [locale, refreshCapability]);

  const clearError = React.useCallback(() => setErrorCode(null), []);

  return {
    phase,
    partialText,
    errorCode,
    clearError,
    capability,
    locale,
    start,
    finish,
    cancel,
    requestModelDownload,
    refreshCapability,
  };
}

export const speechRecognitionTestUtils = {appendTranscript};
