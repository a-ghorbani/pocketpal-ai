import LocalPal from '../LocalPal';

/**
 * LocalPal is a WatermelonDB model, but its `pact` / `greeting` round-trip
 * logic is pure JSON-stringify/parse via getters. Under the jest mock for
 * watermelondb decorators (see __mocks__/external/@nozbe/watermelondb/
 * decorators.js) fields are just plain instance properties, so we can set
 * them directly and exercise toPal() / getters without a real DB.
 */
function makePal(raw: Record<string, any> = {}): LocalPal {
  // WatermelonDB decorators are no-ops in the jest mock, so a plain object
  // with LocalPal.prototype is enough to exercise the pure-JS round-trip.
  const base: Record<string, any> = {
    name: 'Test',
    systemPrompt: '',
    isSystemPromptChanged: false,
    useAIPrompt: false,
    source: 'local',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    ...raw,
  };
  const instance = Object.create(LocalPal.prototype);
  for (const [k, v] of Object.entries(base)) {
    Object.defineProperty(instance, k, {
      value: v,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  }
  return instance as LocalPal;
}

describe('LocalPal.toPal - pact / greeting round-trip', () => {
  it('serializes pact via safeStringify and parses via getter', () => {
    const pactData = {
      talents: [
        {name: 'render_html', necessity: 'required'},
        {name: 'calculate', necessity: 'optional'},
      ],
    };
    const stringified = LocalPal.safeStringify(pactData);
    expect(stringified).toBe(
      '{"talents":[{"name":"render_html","necessity":"required"},{"name":"calculate","necessity":"optional"}]}',
    );

    const pal = makePal({pact: stringified});
    expect(pal.pactObject).toEqual(pactData);
    const view = pal.toPal();
    expect(view.pact).toEqual(pactData);
  });

  it('serializes greeting via safeStringify and parses via getter', () => {
    const stringified = LocalPal.safeStringify({text: 'hi there'});
    expect(stringified).toBe('{"text":"hi there"}');

    const pal = makePal({greeting: stringified});
    expect(pal.greetingObject).toEqual({text: 'hi there'});
    expect(pal.toPal().greeting).toEqual({text: 'hi there'});
  });

  it('returns undefined when pact/greeting are unset', () => {
    const pal = makePal({});
    expect(pal.pactObject).toBeUndefined();
    expect(pal.greetingObject).toBeUndefined();
    const view = pal.toPal();
    expect(view.pact).toBeUndefined();
    expect(view.greeting).toBeUndefined();
  });

  it('safeStringify returns undefined for null/undefined (preserves absence)', () => {
    expect(LocalPal.safeStringify(undefined)).toBeUndefined();
    expect(LocalPal.safeStringify(null)).toBeUndefined();
  });

  it('getters are defensive against malformed JSON', () => {
    const pal = makePal({pact: 'not json', greeting: '{bad'});
    expect(pal.pactObject).toBeUndefined();
    expect(pal.greetingObject).toBeUndefined();
  });

  it('safeStringifyArray always returns a string (never undefined)', () => {
    expect(LocalPal.safeStringifyArray([])).toBe('[]');
    expect(LocalPal.safeStringifyArray(['a', 'b'])).toBe('["a","b"]');
  });
});
