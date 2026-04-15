import type {Voice} from '../../types';

/**
 * Supertonic voice catalog (10 voices: 5 female, 5 male).
 *
 * Engine is wired but Supertonic inference itself is STUBBED in v1.0 —
 * the catalog is declared here so the v1.1 UI has something to render and
 * v1.2 can flip the engine on without touching the list.
 *
 * `character` is a catalog-level default used by the voice-led picker to
 * group voices across engines (warm / clear / deep / bright).
 */
export const SUPERTONIC_VOICES: Voice[] = [
  {
    id: 'F1',
    name: 'Sarah',
    engine: 'supertonic',
    language: 'en',
    gender: 'f',
    character: 'warm',
  },
  {
    id: 'F2',
    name: 'Lily',
    engine: 'supertonic',
    language: 'en',
    gender: 'f',
    character: 'bright',
  },
  {
    id: 'F3',
    name: 'Jessica',
    engine: 'supertonic',
    language: 'en',
    gender: 'f',
    character: 'clear',
  },
  {
    id: 'F4',
    name: 'Olivia',
    engine: 'supertonic',
    language: 'en',
    gender: 'f',
    character: 'warm',
  },
  {
    id: 'F5',
    name: 'Emily',
    engine: 'supertonic',
    language: 'en',
    gender: 'f',
    character: 'clear',
  },
  {
    id: 'M1',
    name: 'Alex',
    engine: 'supertonic',
    language: 'en',
    gender: 'm',
    character: 'clear',
  },
  {
    id: 'M2',
    name: 'James',
    engine: 'supertonic',
    language: 'en',
    gender: 'm',
    character: 'deep',
  },
  {
    id: 'M3',
    name: 'Robert',
    engine: 'supertonic',
    language: 'en',
    gender: 'm',
    character: 'deep',
  },
  {
    id: 'M4',
    name: 'Sam',
    engine: 'supertonic',
    language: 'en',
    gender: 'm',
    character: 'bright',
  },
  {
    id: 'M5',
    name: 'Daniel',
    engine: 'supertonic',
    language: 'en',
    gender: 'm',
    character: 'deep',
  },
];
