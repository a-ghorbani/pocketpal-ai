/**
 * STT engine registry.
 *
 * Mirrors the TTS engineRegistry pattern: engines register by id,
 * and the runtime picks the best available one.
 */

import type {STTEngine, STTEngineId} from './types';
import {WhisperSTTEngine} from './WhisperSTTEngine';
import {SystemSTTEngine} from './SystemSTTEngine';

const engines = new Map<STTEngineId, STTEngine>();

let registered = false;

export function registerSTTEngines(): void {
  if (registered) {
    return;
  }
  engines.set('whisper', new WhisperSTTEngine());
  engines.set('system', new SystemSTTEngine());
  registered = true;
}

export function getEngine(id: STTEngineId): STTEngine | undefined {
  registerSTTEngines();
  return engines.get(id);
}

export function getAllEngines(): STTEngine[] {
  registerSTTEngines();
  return Array.from(engines.values());
}

export function resetSTTEngines(): void {
  engines.clear();
  registered = false;
}
