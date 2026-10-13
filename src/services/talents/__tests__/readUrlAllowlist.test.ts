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
        'https://foo.com:8443/a?q=1',
      ])('still refuses a component mismatch across www (%s)', request => {
        allowReadUrls(['https://www.foo.com/a?q=1']);
        expect(matchReadUrl(request)).toBeNull();
      });

      it.each([
        'https://docs.foo.com/a',
        'https://www.www.foo.com/a',
        'https://wwwfoo.com/a',
      ])('refuses other subdomains and lookalikes (%s)', request => {
        allowReadUrls(['https://foo.com/a', 'https://www.foo.com/a']);
        expect(matchReadUrl(request)).toBeNull();
      });

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

      it('toggles only the host, never www text in the path or query', () => {
        allowReadUrls(['https://foo.com/www.x?www.y']);
        expect(matchReadUrl('https://www.foo.com/www.x?www.y')).toBe(
          'https://foo.com/www.x?www.y',
        );
      });

      it('any match is a stored entry', () => {
        const stored = [
          'http://1.2.3.4/x',
          'https://foo.com./y',
          'http://127.0.0.1/z',
          'http://[::1]/v',
          'https://foo.com/',
          'https://www.foo.com/',
        ];
        allowReadUrls(stored);
        for (const request of [
          'http://www.1.2.3.4/x',
          'https://www.foo.com./y',
          'http://www.0x7f.1/z',
          'http://[::1]/v',
          'https://foo.com/',
          'https://www.foo.com/',
          'https://foo.com/?',
        ]) {
          expect([null, ...stored]).toContain(matchReadUrl(request));
        }
        expect(matchReadUrl('https://foo.com/')).not.toBeNull();
      });

      it.each([
        ['web-site.com read in about pages', 'https://web-site.com/about'],
        ['read https://web-site.com in about pages', 'https://web-site.com/a'],
        ['web-site.com', 'https://www.web-site.com/x?y=1'],
        ['www.web-site.com', 'http://web-site.com/'],
        ['1password.com and 9gag.com', 'https://1password.com/'],
        ['1password.com and 9gag.com', 'https://9gag.com/hot'],
        ['docs.example.co.uk/x', 'https://docs.example.co.uk/y?z=1'],
        ['try sub.domain.io, please', 'https://sub.domain.io/a_b-c~d'],
        ['Read Web-Site.COM.', 'https://web-site.com/a'],
        ['(see web-site.com)', 'https://web-site.com/'],
        ['[x](web-site.com)', 'https://web-site.com/'],
        ['"web-site.com"', 'https://web-site.com/'],
        ['<web-site.com>', 'https://web-site.com/'],
        ['web-site.com:8080/admin', 'https://web-site.com:8080/x'],
        ['http://192.168.1.10/', 'http://192.168.1.10/status'],
        [
          'https://en.wikipedia.org/wiki/Python_(programming_language)',
          'https://en.wikipedia.org/wiki/Main_Page',
        ],
        ['请读web-site.com的文档', 'https://web-site.com/docs'],
        ['“web-site.com”', 'https://web-site.com/'],
        ['«web-site.com»', 'https://web-site.com/'],
        ['（web-site.com）', 'https://web-site.com/'],
        ['site:web-site.com', 'https://web-site.com/'],
        ['Docs:web-site.com', 'https://web-site.com/'],
        ['web-site.comを読んで', 'https://web-site.com/'],
        ['check web-site.com🙂', 'https://web-site.com/'],
        ['read firecrawl.dev🙏 please', 'https://firecrawl.dev/'],
        ['web-site.com✅', 'https://web-site.com/'],
        ['web-site.com❤️', 'https://web-site.com/'],
        ['©web-site.com', 'https://web-site.com/'],
        ['google.com, bing.com; duckduckgo.com!', 'https://google.com/'],
        ['google.com, bing.com; duckduckgo.com!', 'https://bing.com/'],
        ['google.com, bing.com; duckduckgo.com!', 'https://duckduckgo.com/'],
        ['firecrawl.dev do?', 'https://www.firecrawl.dev/'],
        ['a.com,b.com', 'https://a.com/'],
        ['a.com,b.com', 'https://b.com/'],
        ['請看「web-site.com」', 'https://web-site.com/'],
        ['web-site.com。', 'https://web-site.com/'],
        ['see xn--bcher-kva.de', 'https://xn--bcher-kva.de/'],
        ['obj.toString', 'https://obj.tostring/'],
        ['请读https://web-site.com。', 'https://web-site.com/x'],
        ['（https://web-site.com）', 'https://web-site.com/x'],
        ['看https://web-site.com，谢谢', 'https://web-site.com/x'],
        ['请帮我看看https://web-site.com的内容', 'https://web-site.com/x'],
        ['https://web-site.com的文档', 'https://web-site.com/x'],
        ['https://web-site.com:8080', 'https://web-site.com:8080/x'],
        ['**web-site.com**', 'https://web-site.com/'],
        ['HTTPS://WEB-SITE.COM/A', 'https://web-site.com/b'],
        ['https://medium.com/@user', 'https://medium.com/x'],
        ["'web-site.com'", 'https://web-site.com/'],
        ['`web-site.com`', 'https://web-site.com/'],
        ['[web-site.com]', 'https://web-site.com/'],
        ['{web-site.com}', 'https://web-site.com/'],
        ['a.com|b.com', 'https://a.com/'],
        ['a.com|b.com', 'https://b.com/'],
        ['see http://192.168.1.10.', 'http://192.168.1.10/status'],
      ])('seeds the named host from user text %j', (userText, request) => {
        seedReadUrlAllowlist([{role: 'user', content: userText}], []);
        expect(matchReadUrl(request)).not.toBeNull();
      });

      it.each([
        ['notes.txt', 'https://notes.txt/'],
        ['file.json', 'https://file.json/'],
        ['README.md', 'https://readme.md/'],
        ['Node.js', 'https://node.js/'],
      ])(
        'seeds a file name the user typed as a host %j',
        (userText, request) => {
          seedReadUrlAllowlist([{role: 'user', content: userText}], []);
          expect(matchReadUrl(request)).not.toBeNull();
        },
      );

      it.each(['https://a.com/x(evil.com)', 'https://a.com/?q=日本evil.com'])(
        'accepts the residual that a host after a bracket or non-ASCII text in a user URL seeds %j',
        userText => {
          seedReadUrlAllowlist([{role: 'user', content: userText}], []);
          expect(matchReadUrl('https://evil.com/')).not.toBeNull();
        },
      );

      it.each([
        ['web-site.com', 'https://web-site.com.evil.com/?d=x'],
        ['web-site.com', 'https://evil-web-site.com/'],
        ['web-site.com', 'https://web-site.co/'],
        ['web-site.com', 'https://docs.web-site.com/'],
        ['docs.example.co.uk', 'https://example.co.uk/'],
        ['web-site.com', 'https://www.www.web-site.com/'],
        ['mail me@web-site.com', 'https://web-site.com/'],
        ['user.name@web-site.com', 'https://user.name/'],
        ['user.name@web-site.com', 'https://web-site.com/'],
        ['e.g.', 'https://e.g/'],
        ['i.e.', 'https://i.e/'],
        ['v1.2.3', 'https://v1.2.3/'],
        ['192.168.1.10', 'http://192.168.1.10/'],
        ['https://u:p@web-site.com/', 'https://web-site.com/'],
        ['x.com/notes.md', 'https://notes.md/'],
        [
          'https://a.com/r?to=evil.com&ref=producthunt.com',
          'https://evil.com/',
        ],
        [
          'https://a.com/r?to=evil.com&ref=producthunt.com',
          'https://producthunt.com/',
        ],
        ['foo.bar.c', 'https://foo.bar/'],
        ['foo.bar.c', 'https://bar.c/'],
        ['https://bücher.de', 'https://bücher.de/über'],
        ['bücher.de', 'https://bücher.de/über'],
        ['https://例子.中国 看看', 'https://例子.中国/x'],
        ['https://한국.kr', 'https://한국.kr/x'],
        ['https://ドメイン.jp', 'https://ドメイン.jp/x'],
        ['https://user.name:pw@web-site.com/', 'https://user.name/'],
        ['https://user.name:pw@web-site.com/', 'https://web-site.com/'],
        ['u:p@web-site.com', 'https://web-site.com/'],
        ['bücher.de', 'https://cher.de/'],
        ['https://bücher.de', 'https://cher.de/'],
        ['https://a.com/r?x=1,evil.com:8/y', 'https://evil.com/'],
        ['my_host.example.com', 'https://host.example.com/'],
        ['ftp://web-site.com', 'https://web-site.com/'],
        ['пример2.com', 'https://2.com/'],
        ['bu\u0308cher.de', 'https://cher.de/'],
        ['điệnthoại.vn', 'https://i.vn/'],
        ['https://việt.com', 'https://t.com/'],
        ['ʃevil.com', 'https://evil.com/'],
        ['bob＠web-site.com', 'https://web-site.com/'],
        ['bob﹫web-site.com', 'https://web-site.com/'],
        ['https://a.com?to=evil.com', 'https://evil.com/'],
        ['a.com#x=evil.com', 'https://evil.com/'],
      ])('seeds no site from user text %j', (userText, probe) => {
        seedReadUrlAllowlist([{role: 'user', content: userText}], []);
        expect(matchReadUrl(probe)).toBeNull();
      });

      it('never returns credentials on a user site', () => {
        seedReadUrlAllowlist([{role: 'user', content: 'web-site.com'}], []);
        expect(matchReadUrl('https://web-site.com/')).not.toBeNull();
        expect(matchReadUrl('https://u:p@web-site.com/')).toBeNull();
        expect(matchReadUrl('https://u@web-site.com/')).toBeNull();
      });
    },
  );

  it('never adds the www partner or the request to the allowlist', () => {
    allowReadUrls(['https://www.foo.com/1']);
    expect(matchReadUrl('https://foo.com/1')).toBe('https://www.foo.com/1');
    expect(matchReadUrl('https://foo.com/2')).toBeNull();
    expect(isReadUrlAllowed('https://foo.com/3')).toBe(false);

    expect(matchReadUrl('https://foo.com/2')).toBeNull();
    expect(matchReadUrl('https://foo.com/1')).toBe('https://www.foo.com/1');
  });

  it('never stores credentialed entries', () => {
    allowReadUrls([
      'https://u:p@foo.com/a',
      'https://:p@foo.com/b',
      'https://u@foo.com/c',
    ]);
    expect(matchReadUrl('https://foo.com/a')).toBeNull();
    expect(matchReadUrl('https://foo.com/b')).toBeNull();
    expect(matchReadUrl('https://foo.com/c')).toBeNull();
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
    it('seeds sites from user text, including multimodal text parts', () => {
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
      expect(isReadUrlAllowed('https://a.com/other')).toBe(true);
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

    it('seeds nothing from a long run of dots', async () => {
      seedReadUrlAllowlist(
        [{role: 'user', content: '.'.repeat(50000) + 'x'}],
        [],
      );
      // A synchronous overrun only trips the timeout once a timer can fire.
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(matchReadUrl('https://x/')).toBeNull();
    }, 1000);

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

    it.each([
      [
        'see https://en.wikipedia.org/wiki/Python_(programming_language).',
        ['https://en.wikipedia.org/wiki/Python_(programming_language)'],
      ],
      ['(docs: https://ex.org/docs/v2?x=1)', ['https://ex.org/docs/v2?x=1']],
      ['[x](https://a.com/p)', ['https://a.com/p']],
      ['见「https://a.com/docs」', ['https://a.com/docs']],
      ['see https://x.com/a…', ['https://x.com/a']],
    ])(
      'drops trailing punctuation and unbalanced parentheses (%s)',
      (text, urls) => {
        expect(extractUrls(text)).toEqual(urls);
      },
    );

    it('trims a long run of unbalanced closing parentheses', () => {
      expect(extractUrls('https://a.com/' + ')'.repeat(20000))).toEqual([
        'https://a.com/',
      ]);
    });

    it('returns nothing for plain text', () => {
      expect(extractUrls('no links here')).toEqual([]);
    });
  });
});
