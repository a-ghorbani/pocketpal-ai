import {
  allowReadUrls,
  extractUrls,
  isReadUrlAllowed,
  resetReadUrlAllowlist,
  seedReadUrlAllowlist,
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

  describe('seedReadUrlAllowlist', () => {
    it('seeds URLs from user text, including multimodal text parts', () => {
      seedReadUrlAllowlist(
        [
          {role: 'user', content: 'read https://a.com/doc'},
          {
            role: 'user',
            content: [{type: 'text', text: 'and https://b.com/page'}],
          },
        ],
        [],
      );
      expect(isReadUrlAllowed('https://a.com/doc')).toBe(true);
      expect(isReadUrlAllowed('https://b.com/page')).toBe(true);
    });

    it('never seeds from assistant or tool message text', () => {
      seedReadUrlAllowlist(
        [
          {role: 'assistant', content: 'see https://laundered.com/x'},
          {role: 'tool', content: 'page body says https://evil.com/y'},
          {role: 'system', content: 'https://sys.com/z'},
        ],
        [],
      );
      expect(isReadUrlAllowed('https://laundered.com/x')).toBe(false);
      expect(isReadUrlAllowed('https://evil.com/y')).toBe(false);
      expect(isReadUrlAllowed('https://sys.com/z')).toBe(false);
    });

    it("seeds structured search-hit URLs from the session's persisted turns", () => {
      seedReadUrlAllowlist(
        [],
        [
          {
            type: 'assistant_turn',
            steps: [
              {
                toolOutcomes: [
                  {
                    result: {
                      type: 'search',
                      results: [{url: 'https://hit.com/a'}],
                    },
                  },
                  // A read_url outcome (page text) must not seed anything.
                  {result: {type: 'text'}},
                ],
              },
            ],
          },
          {type: 'text'},
        ],
      );
      expect(isReadUrlAllowed('https://hit.com/a')).toBe(true);
    });

    it('replaces the previous run entirely (reset semantics)', () => {
      allowReadUrls(['https://stale.com/old']);
      seedReadUrlAllowlist([{role: 'user', content: 'https://new.com/n'}], []);
      expect(isReadUrlAllowed('https://stale.com/old')).toBe(false);
      expect(isReadUrlAllowed('https://new.com/n')).toBe(true);
    });
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
