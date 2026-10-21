import {getAllEngines, getEngine} from '../engineRegistry';
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

  it('getAllEngines returns the five engines in setup-sheet order: kitten, kokoro, supertonic, phonon, system', () => {
    const all = getAllEngines();
    expect(all).toHaveLength(5);
    expect(all.map(e => e.id)).toEqual([
      'kitten',
      'kokoro',
      'supertonic',
      'phonon',
      'system',
    ]);
  });

  it('returns stable singleton instances across calls', () => {
    expect(getEngine('kokoro')).toBe(getEngine('kokoro'));
    expect(getEngine('kitten')).toBe(getEngine('kitten'));
  });
});
