import {KittenEngine} from './engines/kitten';
import {KokoroEngine} from './engines/kokoro';
import {PhononEngine} from './engines/phonon';
import {SupertonicEngine} from './engines/supertonic';
import {SystemEngine} from './engines/system';
import type {Engine, EngineId, NeuralEngine, NeuralEngineId} from './types';

const systemEngine = new SystemEngine();
const supertonicEngine = new SupertonicEngine();
const kokoroEngine = new KokoroEngine();
const kittenEngine = new KittenEngine();
const phononEngine = new PhononEngine();

const neuralEngines: Record<NeuralEngineId, NeuralEngine> = {
  kitten: kittenEngine,
  kokoro: kokoroEngine,
  supertonic: supertonicEngine,
  phonon: phononEngine,
};

const engines: Record<EngineId, Engine> = {
  ...neuralEngines,
  system: systemEngine,
};

export const getEngine = (id: EngineId): Engine => {
  const engine = engines[id];
  if (!engine) {
    throw new Error(`[tts] Unknown engine id: ${String(id)}`);
  }
  return engine;
};

export const getNeuralEngine = (id: NeuralEngineId): NeuralEngine => {
  const engine = neuralEngines[id];
  if (!engine) {
    throw new Error(`[tts] Unknown neural engine id: ${String(id)}`);
  }
  return engine;
};

/**
 * All engines in the order they're rendered in the setup sheet:
 * Phonon, Kitten, Kokoro, Supertonic, System.
 */
export const getAllEngines = (): Engine[] => [
  phononEngine,
  kittenEngine,
  kokoroEngine,
  supertonicEngine,
  systemEngine,
];
