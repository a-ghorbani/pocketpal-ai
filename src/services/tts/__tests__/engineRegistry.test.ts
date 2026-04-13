import {getAllEngines, getEngine} from '../engineRegistry';
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

  it('getAllEngines returns both engines with correct ids', () => {
    const all = getAllEngines();
    expect(all).toHaveLength(2);
    const ids = all.map(e => e.id).sort();
    expect(ids).toEqual(['supertonic', 'system']);
  });
});
