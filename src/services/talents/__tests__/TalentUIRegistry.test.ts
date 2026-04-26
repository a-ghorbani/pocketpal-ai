import {TalentUIRegistry} from '../TalentUIRegistry';
import {RenderHtmlTalentUI} from '../RenderHtmlTalentUI';
import {
  registerDefaultTalents,
  resetRegisteredFlag,
  talentUIRegistry,
} from '../index';
import {talentRegistry} from '../TalentRegistry';

describe('TalentUIRegistry', () => {
  it('registers and retrieves UIs by name', () => {
    const reg = new TalentUIRegistry();
    const ui = new RenderHtmlTalentUI();
    reg.register(ui);
    expect(reg.has('render_html')).toBe(true);
    expect(reg.get('render_html')).toBe(ui);
  });

  it('returns undefined for unknown names', () => {
    const reg = new TalentUIRegistry();
    expect(reg.get('no_such_talent')).toBeUndefined();
    expect(reg.has('no_such_talent')).toBe(false);
  });

  it('overwrites UIs registered under the same name (last wins)', () => {
    const reg = new TalentUIRegistry();
    const a = {name: 'render_html'};
    const b = {name: 'render_html'};
    reg.register(a);
    reg.register(b);
    expect(reg.get('render_html')).toBe(b);
  });

  it('reset() clears all UIs', () => {
    const reg = new TalentUIRegistry();
    reg.register(new RenderHtmlTalentUI());
    reg.reset();
    expect(reg.has('render_html')).toBe(false);
  });

  describe('registerDefaultTalents registers UIs', () => {
    beforeEach(() => {
      talentRegistry.reset();
      talentUIRegistry.reset();
      resetRegisteredFlag();
    });

    it('registers render_html UI alongside engines', () => {
      registerDefaultTalents();
      expect(talentUIRegistry.has('render_html')).toBe(true);
    });

    it('is idempotent across calls — same UI instance', () => {
      registerDefaultTalents();
      const firstInstance = talentUIRegistry.get('render_html');
      registerDefaultTalents();
      const secondInstance = talentUIRegistry.get('render_html');
      expect(firstInstance).toBe(secondInstance);
      expect(talentUIRegistry.has('render_html')).toBe(true);
    });

    it('re-registers after reset + resetRegisteredFlag', () => {
      registerDefaultTalents();
      talentUIRegistry.reset();
      talentRegistry.reset();
      resetRegisteredFlag();
      registerDefaultTalents();
      expect(talentUIRegistry.has('render_html')).toBe(true);
    });
  });
});
