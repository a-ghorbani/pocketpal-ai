/**
 * Native bridge event types and helper to subscribe to STT events.
 *
 * Both Whisper and System STT engines emit events via the native
 * emitter. This module provides a typed wrapper for subscribing.
 */

import {NativeEventEmitter} from 'react-native';

export type STTEventName =
  | 'stt:start' // recognition started
  | 'stt:partial' // partial (interim) result
  | 'stt:result' // final result
  | 'stt:error' // error occurred
  | 'stt:end'; // recognition ended

export interface STTEventData {
  text?: string;
  isFinal?: boolean;
  confidence?: number;
  language?: string;
  segments?: Array<{
    text: string;
    start: number;
    end: number;
  }>;
  error?: string;
}

/**
 * Subscribe to STT events from a native module.
 * Returns an unsubscribe function.
 *
 * Usage:
 *   const unsubscribe = subscribeToSTTEvents(nativeModule, {
 *     onStart: () => ...,
 *     onPartial: (text) => ...,
 *     onResult: (data) => ...,
 *     onError: (err) => ...,
 *     onEnd: () => ...,
 *   });
 */
export function subscribeToSTTEvents(
  nativeModule: any,
  callbacks: {
    onStart?: () => void;
    onPartial?: (text: string) => void;
    onResult?: (data: STTEventData) => void;
    onError?: (error: string) => void;
    onEnd?: () => void;
  },
): () => void {
  const emitter = new NativeEventEmitter(nativeModule);
  const subscriptions: Array<() => void> = [];

  if (callbacks.onStart) {
    const sub = emitter.addListener('stt:start', () => callbacks.onStart?.());
    subscriptions.push(() => sub.remove());
  }

  if (callbacks.onPartial) {
    const sub = emitter.addListener('stt:partial', (data: STTEventData) => {
      callbacks.onPartial?.(data.text || '');
    });
    subscriptions.push(() => sub.remove());
  }

  if (callbacks.onResult) {
    const sub = emitter.addListener('stt:result', (data: STTEventData) => {
      callbacks.onResult?.(data);
    });
    subscriptions.push(() => sub.remove());
  }

  if (callbacks.onError) {
    const sub = emitter.addListener('stt:error', (data: STTEventData) => {
      callbacks.onError?.(data.error || 'Unknown error');
    });
    subscriptions.push(() => sub.remove());
  }

  if (callbacks.onEnd) {
    const sub = emitter.addListener('stt:end', () => callbacks.onEnd?.());
    subscriptions.push(() => sub.remove());
  }

  return () => subscriptions.forEach(fn => fn());
}
