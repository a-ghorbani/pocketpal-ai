import {
  allowReadUrls,
  extractUrls,
  isReadUrlAllowed,
  resetReadUrlAllowlist,
} from '../readUrlAllowlist';

describe('readUrlAllowlist', () => {
  beforeEach(() => resetReadUrlAllowlist());

  it('allows an exact allowlisted URL and nothing before seeding', () => {
    expect(isReadUrlAllowed('https://example.com/a')).toBe(false);
    allowReadUrls(['https://example.com/a']);
    expect(isReadUrlAllowed('https://example.com/a')).toBe(true);
  });

  it('rejects a mutated query string on an allowlisted URL (exfil guard)', () => {
    allowReadUrls(['https://example.com/article?id=1']);
    expect(isReadUrlAllowed('https://example.com/article?id=1')).toBe(true);
    expect(
      isReadUrlAllowed('https://example.com/article?id=1&leak=secret'),
    ).toBe(false);
    expect(isReadUrlAllowed('https://example.com/article')).toBe(false);
  });

  it('rejects an attacker URL that was never returned by search', () => {
    allowReadUrls(['https://legit.example.com/page']);
    expect(isReadUrlAllowed('https://evil.example.net/?q=secret')).toBe(false);
  });

  it('tolerates fragment and host-case differences (model transcription noise)', () => {
    allowReadUrls(['https://Example.com/a#section-2']);
    expect(isReadUrlAllowed('https://example.com/a')).toBe(true);
    expect(isReadUrlAllowed('https://example.com/a#other')).toBe(true);
  });

  it('matches a bare origin regardless of trailing slash', () => {
    allowReadUrls(['https://example.com']);
    expect(isReadUrlAllowed('https://example.com/')).toBe(true);
  });

  it('reset clears prior runs', () => {
    allowReadUrls(['https://example.com/a']);
    resetReadUrlAllowlist();
    expect(isReadUrlAllowed('https://example.com/a')).toBe(false);
  });

  it('ignores unparseable and non-http(s) seeds', () => {
    allowReadUrls(['not a url', 'file:///etc/passwd', '']);
    expect(isReadUrlAllowed('file:///etc/passwd')).toBe(false);
  });

  describe('extractUrls', () => {
    it('pulls http(s) URLs out of user text, dropping trailing punctuation', () => {
      expect(
        extractUrls('read https://a.com/x, then https://b.com/y.'),
      ).toEqual(['https://a.com/x', 'https://b.com/y']);
    });

    it('returns nothing for plain text', () => {
      expect(extractUrls('no links here')).toEqual([]);
    });
  });
});
