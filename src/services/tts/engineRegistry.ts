import {KittenEngine} from './engines/kitten';
import {KokoroEngine} from './engines/kokoro';
import {SupertonicEngine} from './engines/supertonic';
import {SystemEngine} from './engines/system';
import type {Engine, EngineId} from './types';

const systemEngine = new SystemEngine();
const supertonicEngine = new SupertonicEngine();
const kokoroEngine = new KokoroEngine();
const kittenEngine = new KittenEngine();

const engines: Record<EngineId, Engine> = {
  kitten: kittenEngine,
  kokoro: kokoroEngine,
  supertonic: supertonicEngine,
  system: systemEngine,
};

export const getEngine = (id: EngineId): Engine => {
  const engine = engines[id];
  if (!engine) {
    throw new Error(`[tts] Unknown engine id: ${String(id)}`);
  }
  return engine;
};

/**
 * All engines in the order they're rendered in the setup sheet:
 * Kitten, Kokoro, Supertonic, System.
 */
export const getAllEngines = (): Engine[] => [
  kittenEngine,
  kokoroEngine,
  supertonicEngine,
  systemEngine,
];
