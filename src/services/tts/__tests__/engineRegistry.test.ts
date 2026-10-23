import {TTS_ENGINE_RUNTIME_BYTES} from '../constants';
import {getAllEngines, getEngine, getNeuralEngine} from '../engineRegistry';
import {KittenEngine} from '../engines/kitten';
import {KokoroEngine} from '../engines/kokoro';
import {PhononEngine} from '../engines/phonon';
import {SupertonicEngine} from '../engines/supertonic';
import {SystemEngine} from '../engines/system';

describe('engineRegistry', () => {
  it('returns the System engine for id "system"', () => {
    const engine = getEngine('system');
    expect(engine).toBeInstanceOf(SystemEngine);
    expect(engine.id).toBe('system');
  });

  it('returns the Supertonic engine for id "supertonic"', () => {
    const engine = getEngine('supertonic');
    expect(engine).toBeInstanceOf(SupertonicEngine);
    expect(engine.id).toBe('supertonic');
  });

  it('returns the Kokoro engine for id "kokoro"', () => {
    const engine = getEngine('kokoro');
    expect(engine).toBeInstanceOf(KokoroEngine);
    expect(engine.id).toBe('kokoro');
  });

  it('returns the Kitten engine for id "kitten"', () => {
    const engine = getEngine('kitten');
    expect(engine).toBeInstanceOf(KittenEngine);
    expect(engine.id).toBe('kitten');
  });

  it('returns the Phonon engine for id "phonon"', () => {
    const engine = getEngine('phonon');
    expect(engine).toBeInstanceOf(PhononEngine);
    expect(engine.id).toBe('phonon');
  });

  it('getAllEngines returns the five engines in setup-sheet order: phonon, kitten, kokoro, supertonic, system', () => {
    const all = getAllEngines();
    expect(all).toHaveLength(5);
    expect(all.map(e => e.id)).toEqual([
      'phonon',
      'kitten',
      'kokoro',
      'supertonic',
      'system',
    ]);
  });

  it('getNeuralEngine returns the Phonon engine for id "phonon"', () => {
    const engine = getNeuralEngine('phonon');
    expect(engine).toBeInstanceOf(PhononEngine);
    expect(engine).toBe(getEngine('phonon'));
  });

  it('getNeuralEngine throws for an unknown or non-neural id', () => {
    expect(() => getNeuralEngine('system' as any)).toThrow(
      /Unknown neural engine id: system/,
    );
    expect(() => getNeuralEngine('nope' as any)).toThrow(
      /Unknown neural engine id: nope/,
    );
  });

  it('returns stable singleton instances across calls', () => {
    expect(getEngine('kokoro')).toBe(getEngine('kokoro'));
    expect(getEngine('kitten')).toBe(getEngine('kitten'));
  });

  it('every neural engine has its own runtime size for the voice mode memory fit', () => {
    const neural = getAllEngines().filter(e => e.id !== 'system');
    expect(Object.keys(TTS_ENGINE_RUNTIME_BYTES).sort()).toEqual(
      neural.map(e => e.id).sort(),
    );
    expect(TTS_ENGINE_RUNTIME_BYTES.phonon).toBe(200 * 1024 * 1024);
  });
});
