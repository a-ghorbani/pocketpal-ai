import {TalentRegistry} from '../TalentRegistry';
import {RenderHtmlEngine} from '../RenderHtmlEngine';
import {
  registerDefaultTalents,
  resetRegisteredFlag,
  talentRegistry,
} from '../index';

describe('TalentRegistry', () => {
  it('registers and retrieves engines by name', () => {
    const reg = new TalentRegistry();
    const engine = new RenderHtmlEngine();
    reg.register(engine);
    expect(reg.has('render_html')).toBe(true);
    expect(reg.get('render_html')).toBe(engine);
  });

  it('returns undefined for unknown names', () => {
    const reg = new TalentRegistry();
    expect(reg.get('no_such_talent')).toBeUndefined();
    expect(reg.has('no_such_talent')).toBe(false);
  });

  it('overwrites engines registered under the same name (last wins)', () => {
    const reg = new TalentRegistry();
    const a = {name: 'render_html', execute: jest.fn()} as any;
    const b = {name: 'render_html', execute: jest.fn()} as any;
    reg.register(a);
    reg.register(b);
    expect(reg.get('render_html')).toBe(b);
  });

  it('reset() clears all engines', () => {
    const reg = new TalentRegistry();
    reg.register(new RenderHtmlEngine());
    reg.reset();
    expect(reg.has('render_html')).toBe(false);
  });

  describe('registerDefaultTalents', () => {
    beforeEach(() => {
      talentRegistry.reset();
      resetRegisteredFlag();
    });

    it('registers render_html, calculate, and datetime', () => {
      registerDefaultTalents();
      expect(talentRegistry.has('render_html')).toBe(true);
      expect(talentRegistry.has('calculate')).toBe(true);
      expect(talentRegistry.has('datetime')).toBe(true);
    });

    it('is idempotent across calls', () => {
      registerDefaultTalents();
      registerDefaultTalents();
      registerDefaultTalents();
      expect(talentRegistry.has('render_html')).toBe(true);
      expect(talentRegistry.has('calculate')).toBe(true);
      expect(talentRegistry.has('datetime')).toBe(true);
    });

    it('re-registers after reset + resetRegisteredFlag', () => {
      registerDefaultTalents();
      talentRegistry.reset();
      resetRegisteredFlag();
      registerDefaultTalents();
      expect(talentRegistry.has('render_html')).toBe(true);
      expect(talentRegistry.has('calculate')).toBe(true);
      expect(talentRegistry.has('datetime')).toBe(true);
    });
  });
});
