import {SupertonicEngine} from './engines/supertonic';
import {SystemEngine} from './engines/system';
import type {Engine, EngineId} from './types';

const systemEngine = new SystemEngine();
const supertonicEngine = new SupertonicEngine();

const engines: Record<EngineId, Engine> = {
  system: systemEngine,
  supertonic: supertonicEngine,
};

export const getEngine = (id: EngineId): Engine => engines[id];

export const getAllEngines = (): Engine[] => [systemEngine, supertonicEngine];
