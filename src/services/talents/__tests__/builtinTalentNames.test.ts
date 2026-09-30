import {BUILTIN_TALENT_NAMES} from '../builtinTalentNames';
import {
  registerDefaultTalents,
  resetRegisteredFlag,
  talentRegistry,
} from '../index';

describe('BUILTIN_TALENT_NAMES', () => {
  beforeEach(() => {
    talentRegistry.reset();
    resetRegisteredFlag();
  });

  it('equals the set of names registerDefaultTalents registers', () => {
    registerDefaultTalents();
    const registered = talentRegistry
      .getAll()
      .map(engine => engine.name)
      .sort();
    expect(registered).toEqual([...BUILTIN_TALENT_NAMES].sort());
  });

  it('is a leaf module, so the store can read it without an import cycle', () => {
    const modulePath = require.resolve('../builtinTalentNames');
    require('../builtinTalentNames');
    expect(require.cache[modulePath]!.children).toHaveLength(0);
  });
});
