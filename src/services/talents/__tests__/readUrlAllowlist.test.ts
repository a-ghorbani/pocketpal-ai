import {
  POLYFILL_URL,
  URL_IMPLEMENTATIONS,
  expectUrlImplementationActive,
  useUrlImplementation,
} from '../../../../jest/urlImplementations';

import {
  allowReadUrls,
  extractUrls,
  isReadUrlAllowed,
  matchReadUrl,
  resetReadUrlAllowlist,
  seedReadUrlAllowlist,
  suggestReadUrls,
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

  describe.each(URL_IMPLEMENTATIONS)(
    'host matching under %s',
    (_label, impl) => {
      useUrlImplementation(impl);

      it('runs against the swapped URL implementation', () => {
        expectUrlImplementationActive(impl);
      });

      it('matches ASCII host case to the stored entry, but never path case', () => {
        allowReadUrls(['https://www.foo.com/A']);
        expect(matchReadUrl('https://WWW.FOO.com/A')).toBe(
          'https://www.foo.com/A',
        );
        expect(matchReadUrl('https://www.foo.com/a')).toBeNull();
        expect(matchReadUrl('https://Foo.com/A')).toBe('https://www.foo.com/A');
      });

      it('matches a stored www entry from the bare host', () => {
        allowReadUrls(['https://www.firecrawl.dev/']);
        expect(matchReadUrl('https://firecrawl.dev/')).toBe(
          'https://www.firecrawl.dev/',
        );
      });

      it('matches a stored bare entry from the www host', () => {
        allowReadUrls(['https://firecrawl.dev/pricing']);
        expect(matchReadUrl('https://www.firecrawl.dev/pricing')).toBe(
          'https://firecrawl.dev/pricing',
        );
      });

      it.each([
        'https://foo.com/a?q=2',
        'https://foo.com/b?q=1',
        'http://foo.com/a?q=1',
        'https://foo.com:8443/a?q=1',
      ])('still refuses a component mismatch across www (%s)', request => {
        allowReadUrls(['https://www.foo.com/a?q=1']);
        expect(matchReadUrl(request)).toBeNull();
      });

      it.each([
        'https://docs.foo.com/a',
        'https://www.www.foo.com/a',
        'https://wwwfoo.com/a',
      ])(
        'refuses other subdomains and lookalikes without suggestions (%s)',
        request => {
          allowReadUrls(['https://foo.com/a']);
          expect(matchReadUrl(request)).toBeNull();
          expect(suggestReadUrls(request)).toEqual([]);
        },
      );

      it('keeps the port exact across www, with the default port elided', () => {
        allowReadUrls(['https://www.foo.com:8443/x', 'https://www.foo.com/d']);
        expect(matchReadUrl('https://foo.com:8443/x')).toBe(
          'https://www.foo.com:8443/x',
        );
        expect(matchReadUrl('https://foo.com/x')).toBeNull();
        expect(matchReadUrl('https://foo.com:443/x')).toBeNull();
        expect(matchReadUrl('https://foo.com:443/d')).toBe(
          'https://www.foo.com/d',
        );
      });

      it.each([
        ['http://www.1.2.3.4/x', null],
        ['https://foo.com/y', null],
        ['https://www.foo.com./y', 'https://foo.com./y'],
        ['http://www.0x7f.1/z', null],
        ['http://www.0x7f/w', null],
        ['http://[::1]/v', 'http://[::1]/v'],
      ])('handles IP, trailing-dot and odd hosts (%s)', (request, expected) => {
        allowReadUrls([
          'http://1.2.3.4/x',
          'https://foo.com./y',
          'http://127.0.0.1/z',
          'http://0.0.0.127/w',
          'http://[::1]/v',
        ]);
        expect(matchReadUrl(request)).toBe(expected);
      });

      it('toggles only the host, never www text in the path or query', () => {
        allowReadUrls(['https://foo.com/www.x?www.y']);
        expect(matchReadUrl('https://www.foo.com/www.x?www.y')).toBe(
          'https://foo.com/www.x?www.y',
        );
      });
    },
  );

  it('prefers the exact entry when both www and bare are stored', () => {
    allowReadUrls(['https://foo.com/', 'https://www.foo.com/']);
    expect(matchReadUrl('https://foo.com/')).toBe('https://foo.com/');
    expect(matchReadUrl('https://www.foo.com/')).toBe('https://www.foo.com/');
  });

  it('never adds the www partner, the request or a suggestion to the allowlist', () => {
    allowReadUrls(['https://www.foo.com/1']);
    expect(matchReadUrl('https://foo.com/1')).toBe('https://www.foo.com/1');
    expect(matchReadUrl('https://foo.com/2')).toBeNull();
    expect(isReadUrlAllowed('https://foo.com/3')).toBe(false);
    suggestReadUrls('https://foo.com/4');

    expect(suggestReadUrls('https://foo.com/')).toEqual([
      'https://www.foo.com/1',
    ]);
    expect(matchReadUrl('https://foo.com/2')).toBeNull();
  });

  describe('suggestReadUrls', () => {
    it('suggests up to three credential-free same-site entries in insertion order', () => {
      allowReadUrls([
        'https://u:p@foo.com/0',
        'https://:p@foo.com/z',
        'https://www.foo.com/1',
        'https://other.com/',
        'https://foo.com/2',
        'http://foo.com:81/3',
        'https://www.foo.com/4',
      ]);
      expect(suggestReadUrls('https://foo.com/secret?d=xyz')).toEqual([
        'https://www.foo.com/1',
        'https://foo.com/2',
        'http://foo.com:81/3',
      ]);
    });

    it('suggests nothing when no stored entry is on the same site', () => {
      allowReadUrls(['https://other.com/']);
      expect(suggestReadUrls('https://foo.com/')).toEqual([]);
    });

    it('suggests nothing for an unparseable request', () => {
      allowReadUrls(['https://foo.com/']);
      expect(suggestReadUrls('not a url')).toEqual([]);
    });
  });

  describe('under the react-native-url-polyfill URL', () => {
    useUrlImplementation(POLYFILL_URL);

    it('does not fold non-ASCII host case (Kelvin sign is not k)', () => {
      expectUrlImplementationActive(POLYFILL_URL);
      allowReadUrls(['https://k.com/']);
      expect(matchReadUrl('https://\u212A.com/')).toBeNull();
    });
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
