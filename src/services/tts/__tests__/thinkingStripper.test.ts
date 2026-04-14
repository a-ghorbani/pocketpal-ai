import {
  ThinkingStripper,
  pickThinkingPlaceholder,
} from '../thinkingStripper';

describe('ThinkingStripper', () => {
  describe('feed() + flush()', () => {
    it('empty <think></think> is dropped, hadNonEmptyThink=false', () => {
      const s = new ThinkingStripper();
      const out = s.feed('<think></think>Hi') + s.flush();
      expect(out).toBe('Hi');
      expect(s.hadNonEmptyThink()).toBe(false);
    });

    it('non-empty <think>hmm</think> is dropped, hadNonEmptyThink=true', () => {
      const s = new ThinkingStripper();
      const out = s.feed('<think>hmm</think>Hi') + s.flush();
      expect(out).toBe('Hi');
      expect(s.hadNonEmptyThink()).toBe(true);
    });

    it('plain text with no tags passes through', () => {
      const s = new ThinkingStripper();
      const out = s.feed('Hi there') + s.flush();
      expect(out).toBe('Hi there');
      expect(s.hadNonEmptyThink()).toBe(false);
    });

    it('tags split across chunk boundaries are handled', () => {
      const s = new ThinkingStripper();
      let out = '';
      out += s.feed('<th');
      out += s.feed('ink>hm');
      out += s.feed('m</thi');
      out += s.feed('nk>Hi');
      out += s.flush();
      expect(out).toBe('Hi');
      expect(s.hadNonEmptyThink()).toBe(true);
    });

    it('partial open tag at end of stream is dropped on flush', () => {
      const s = new ThinkingStripper();
      let out = '';
      out += s.feed('abc<th');
      out += s.flush();
      expect(out).toBe('abc');
      expect(s.hadNonEmptyThink()).toBe(false);
    });

    it('unclosed <think> block drops the content', () => {
      const s = new ThinkingStripper();
      const out = s.feed('<think>forever') + s.flush();
      expect(out).toBe('');
      expect(s.hadNonEmptyThink()).toBe(true);
    });

    it('multiple think blocks are all stripped', () => {
      const s = new ThinkingStripper();
      const out =
        s.feed('<think>a</think>x<think>b</think>y') + s.flush();
      expect(out).toBe('xy');
      expect(s.hadNonEmptyThink()).toBe(true);
    });

    it('whitespace-only think body counts as empty', () => {
      const s = new ThinkingStripper();
      const out = s.feed('<think>   \n  </think>Hi') + s.flush();
      expect(out).toBe('Hi');
      expect(s.hadNonEmptyThink()).toBe(false);
    });
  });

  describe('stripFinal()', () => {
    it('passes through plain text', () => {
      expect(ThinkingStripper.stripFinal('Hi')).toEqual({
        text: 'Hi',
        hadNonEmptyThink: false,
      });
    });

    it('drops empty <think></think>', () => {
      expect(ThinkingStripper.stripFinal('<think></think>Hi')).toEqual({
        text: 'Hi',
        hadNonEmptyThink: false,
      });
    });

    it('drops non-empty <think>hmm</think> and flags hadNonEmptyThink', () => {
      expect(ThinkingStripper.stripFinal('<think>hmm</think>Hi')).toEqual({
        text: 'Hi',
        hadNonEmptyThink: true,
      });
    });
  });

  describe('pickThinkingPlaceholder()', () => {
    it('returns a deterministic entry when rng is fixed', () => {
      expect(pickThinkingPlaceholder(() => 0)).toBe('Hmm, let me think.');
    });

    it('returns a string from the placeholder pool with default rng', () => {
      const out = pickThinkingPlaceholder();
      expect(typeof out).toBe('string');
      expect(out.length).toBeGreaterThan(0);
    });
  });
});
