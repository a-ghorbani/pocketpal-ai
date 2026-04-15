import type {Voice} from '../../types';

/**
 * Kokoro 82M v1.0 voice catalog (28 voices).
 *
 * IDs follow the `<lang><gender>_<name>` convention used by the upstream
 * repo: `a` = American English, `b` = British English, `e` = Spanish,
 * `f` = French, `h` = Hindi, `i` = Italian, `j` = Japanese, `p` =
 * Brazilian Portuguese, `z` = Mandarin Chinese. `f` = female, `m` = male.
 *
 * v1b scope: surface English voices only in the picker (filter at the UI
 * layer by `language === 'en'`). Language switching is deferred to the
 * v1b-TTS-language follow-up.
 *
 * `character` is a catalog-level default used by the voice-led picker to
 * group voices across engines (warm / clear / deep / bright).
 */
export const KOKORO_VOICES: Voice[] = [
  // American English — female
  {
    id: 'af_heart',
    name: 'Heart',
    engine: 'kokoro',
    language: 'en',
    gender: 'f',
    character: 'warm',
  },
  {
    id: 'af_bella',
    name: 'Bella',
    engine: 'kokoro',
    language: 'en',
    gender: 'f',
    character: 'warm',
  },
  {
    id: 'af_nicole',
    name: 'Nicole',
    engine: 'kokoro',
    language: 'en',
    gender: 'f',
    character: 'warm',
  },
  {
    id: 'af_sarah',
    name: 'Sarah',
    engine: 'kokoro',
    language: 'en',
    gender: 'f',
    character: 'warm',
  },
  {
    id: 'af_sky',
    name: 'Sky',
    engine: 'kokoro',
    language: 'en',
    gender: 'f',
    character: 'clear',
  },
  {
    id: 'af_alloy',
    name: 'Alloy',
    engine: 'kokoro',
    language: 'en',
    gender: 'f',
    character: 'clear',
  },
  {
    id: 'af_aoede',
    name: 'Aoede',
    engine: 'kokoro',
    language: 'en',
    gender: 'f',
    character: 'clear',
  },
  {
    id: 'af_jessica',
    name: 'Jessica',
    engine: 'kokoro',
    language: 'en',
    gender: 'f',
    character: 'clear',
  },
  {
    id: 'af_kore',
    name: 'Kore',
    engine: 'kokoro',
    language: 'en',
    gender: 'f',
    character: 'clear',
  },
  {
    id: 'af_nova',
    name: 'Nova',
    engine: 'kokoro',
    language: 'en',
    gender: 'f',
    character: 'clear',
  },
  {
    id: 'af_river',
    name: 'River',
    engine: 'kokoro',
    language: 'en',
    gender: 'f',
    character: 'clear',
  },
  // American English — male
  {
    id: 'am_adam',
    name: 'Adam',
    engine: 'kokoro',
    language: 'en',
    gender: 'm',
    character: 'deep',
  },
  {
    id: 'am_echo',
    name: 'Echo',
    engine: 'kokoro',
    language: 'en',
    gender: 'm',
    character: 'bright',
  },
  {
    id: 'am_eric',
    name: 'Eric',
    engine: 'kokoro',
    language: 'en',
    gender: 'm',
    character: 'bright',
  },
  {
    id: 'am_fenrir',
    name: 'Fenrir',
    engine: 'kokoro',
    language: 'en',
    gender: 'm',
    character: 'deep',
  },
  {
    id: 'am_liam',
    name: 'Liam',
    engine: 'kokoro',
    language: 'en',
    gender: 'm',
    character: 'bright',
  },
  {
    id: 'am_michael',
    name: 'Michael',
    engine: 'kokoro',
    language: 'en',
    gender: 'm',
    character: 'deep',
  },
  {
    id: 'am_onyx',
    name: 'Onyx',
    engine: 'kokoro',
    language: 'en',
    gender: 'm',
    character: 'deep',
  },
  {
    id: 'am_puck',
    name: 'Puck',
    engine: 'kokoro',
    language: 'en',
    gender: 'm',
    character: 'bright',
  },
  {
    id: 'am_santa',
    name: 'Santa',
    engine: 'kokoro',
    language: 'en',
    gender: 'm',
    character: 'bright',
  },
  // British English — female
  {
    id: 'bf_alice',
    name: 'Alice',
    engine: 'kokoro',
    language: 'en-GB',
    gender: 'f',
    character: 'warm',
  },
  {
    id: 'bf_emma',
    name: 'Emma',
    engine: 'kokoro',
    language: 'en-GB',
    gender: 'f',
    character: 'clear',
  },
  {
    id: 'bf_isabella',
    name: 'Isabella',
    engine: 'kokoro',
    language: 'en-GB',
    gender: 'f',
    character: 'warm',
  },
  {
    id: 'bf_lily',
    name: 'Lily',
    engine: 'kokoro',
    language: 'en-GB',
    gender: 'f',
    character: 'clear',
  },
  // British English — male
  {
    id: 'bm_daniel',
    name: 'Daniel',
    engine: 'kokoro',
    language: 'en-GB',
    gender: 'm',
    character: 'deep',
  },
  {
    id: 'bm_fable',
    name: 'Fable',
    engine: 'kokoro',
    language: 'en-GB',
    gender: 'm',
    character: 'bright',
  },
  {
    id: 'bm_george',
    name: 'George',
    engine: 'kokoro',
    language: 'en-GB',
    gender: 'm',
    character: 'deep',
  },
  {
    id: 'bm_lewis',
    name: 'Lewis',
    engine: 'kokoro',
    language: 'en-GB',
    gender: 'm',
    character: 'deep',
  },
];
