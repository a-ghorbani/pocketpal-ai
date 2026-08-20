import {marked} from 'marked';

marked.use({});

/**
 * Search projection for one rendered markdown chunk.
 *
 * `html` is the untouched `marked()` output. Each segment carries the visible
 * text of one block plus, per visible character, the `[start, end)` byte range
 * it occupies in `html`. Matching runs against the visible text; emitting
 * splices into `html`, so bytes outside a match are copied verbatim and an
 * entity this module cannot decode costs a missed match rather than a mangled
 * one.
 *
 * The tokenizer ends a tag at the first `>`, so a `>` inside a raw-HTML
 * attribute value leaks into the visible text and can be matched. Model output
 * reaching that shape is rare and it predates this module, but it is the one
 * case where a splice can land inside a tag.
 */
export interface SearchSegment {
  text: string;
  /**
   * Flat `[start, end)` pairs — `spans[2i]`/`spans[2i+1]` describe `text[i]`.
   * Flat and typed rather than an array of pairs: at one nested array per
   * visible character this dominated the cache's footprint (~72 B/char versus
   * 8 B here).
   */
  spans: Int32Array;
}

export interface SearchIndex {
  html: string;
  segments: SearchSegment[];
}

/** A match, split into ranges that are contiguous in the HTML. */
export type MatchRuns = Array<[number, number]>;

// `marked` escapes only &amp; &lt; &gt; &quot; &#39;, but a model can emit any
// entity as raw text. Numeric refs decode exhaustively; this table covers the
// named ones common in prose. Anything unlisted stays literal in the index —
// it costs a missed match, never a corrupted message.
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  laquo: '«',
  raquo: '»',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  deg: '°',
  copy: '©',
  reg: '®',
  trade: '™',
  middot: '·',
  bull: '•',
  agrave: 'à',
  aacute: 'á',
  acirc: 'â',
  atilde: 'ã',
  auml: 'ä',
  aring: 'å',
  ccedil: 'ç',
  egrave: 'è',
  eacute: 'é',
  ecirc: 'ê',
  euml: 'ë',
  igrave: 'ì',
  iacute: 'í',
  icirc: 'î',
  iuml: 'ï',
  ntilde: 'ñ',
  ograve: 'ò',
  oacute: 'ó',
  ocirc: 'ô',
  otilde: 'õ',
  ouml: 'ö',
  ugrave: 'ù',
  uacute: 'ú',
  ucirc: 'û',
  uuml: 'ü',
  yuml: 'ÿ',
  szlig: 'ß',
  oslash: 'ø',
  aelig: 'æ',
  euro: '€',
  pound: '£',
  yen: '¥',
};

const ENTITY = /&(?:#x([0-9a-f]+)|#(\d+)|([a-z][a-z0-9]*));/gi;
const TAG_OR_TEXT = /(<[^>]+>)|([^<]+)/g;
const TAG_NAME = /^<\/?([a-z0-9]+)/i;

// Block-level tags end a segment, so a match never spans two blocks. Inline
// tags do not, so `hello <strong>world</strong>` matches "hello world".
const BLOCK_TAGS = new Set([
  'p',
  'div',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'li',
  'ul',
  'ol',
  'pre',
  'blockquote',
  'table',
  'thead',
  'tbody',
  'tr',
  'td',
  'th',
  'br',
  'hr',
  'section',
  'article',
  'figure',
  'figcaption',
  'caption',
  'details',
  'summary',
  'dl',
  'dt',
  'dd',
]);

// U+FFFC OBJECT REPLACEMENT CHARACTER — stands in for an entity we cannot
// decode. Keeps the text/spans mapping 1:1 without being matchable.
const UNDECODABLE = '￼';

const MAX_CODE_POINT = 0x10ffff;

// `String.fromCodePoint` throws above U+10FFFF, and `marked` passes values
// just past it (`&#1114112;`, `&#x110000;`) through unescaped — so this runs
// on model-authored text inside render.
const fromCodePoint = (value: number): string | undefined =>
  Number.isFinite(value) && value >= 0 && value <= MAX_CODE_POINT
    ? String.fromCodePoint(value)
    : undefined;

/** `undefined` for an entity this module cannot decode. */
const decodeEntity = (
  hex?: string,
  dec?: string,
  name?: string,
): string | undefined => {
  if (hex) {
    return fromCodePoint(parseInt(hex, 16));
  }
  if (dec) {
    return fromCodePoint(parseInt(dec, 10));
  }
  return NAMED_ENTITIES[(name as string).toLowerCase()];
};

export const buildSearchIndex = (markdown: string): SearchIndex => {
  const html = marked(markdown) as string;
  const segments: SearchSegment[] = [];

  let text = '';
  let spans: number[] = [];
  const endSegment = () => {
    if (text.length > 0) {
      segments.push({text, spans: Int32Array.from(spans)});
    }
    text = '';
    spans = [];
  };

  // `text` and `spans` are strictly 1:1 — every offset downstream depends on
  // it. A decoded entity can still be more than one UTF-16 unit (astral code
  // points), so the trailing units collapse to a zero-width span at the
  // entity's end: the run stays contiguous and a match anywhere inside it
  // resolves to the whole entity.
  const pushChar = (char: string, start: number, end: number) => {
    text += char[0];
    spans.push(start, end);
    for (let i = 1; i < char.length; i++) {
      text += char[i];
      spans.push(end, end);
    }
  };

  const pushLiteral = (raw: string, start: number) => {
    for (let i = 0; i < raw.length; i++) {
      pushChar(raw[i], start + i, start + i + 1);
    }
  };

  // `<pre>` content is excluded: CodeRenderer re-reads rawHTML and hands it to
  // a syntax highlighter, so an injected element would render as literal text.
  let preDepth = 0;

  TAG_OR_TEXT.lastIndex = 0;
  let token: RegExpExecArray | null;
  while ((token = TAG_OR_TEXT.exec(html))) {
    const [, tag, textRun] = token;

    if (tag) {
      const name = tag.match(TAG_NAME)?.[1]?.toLowerCase() ?? '';
      if (name === 'pre' && !tag.endsWith('/>')) {
        preDepth = tag[1] === '/' ? Math.max(0, preDepth - 1) : preDepth + 1;
      }
      if (BLOCK_TAGS.has(name)) {
        endSegment();
      }
      continue;
    }

    if (preDepth > 0) {
      endSegment();
      continue;
    }

    const offset = token.index;
    let consumed = 0;
    ENTITY.lastIndex = 0;
    let entity: RegExpExecArray | null;
    while ((entity = ENTITY.exec(textRun))) {
      pushLiteral(textRun.slice(consumed, entity.index), offset + consumed);

      const decoded = decodeEntity(entity[1], entity[2], entity[3]);
      if (decoded === undefined) {
        // Not decodable: stand it in with a character no query can contain, so
        // it matches neither the glyph it renders as nor its own spelling —
        // `&thetasym;` must not be found by searching "thetasym", just as
        // `&amp;` is not found by searching "amp".
        pushChar(
          UNDECODABLE,
          offset + entity.index,
          offset + entity.index + entity[0].length,
        );
      } else {
        pushChar(
          decoded,
          offset + entity.index,
          offset + entity.index + entity[0].length,
        );
      }
      consumed = entity.index + entity[0].length;
    }
    pushLiteral(textRun.slice(consumed), offset + consumed);
  }
  endSegment();

  return {html, segments};
};

// Bounded by indexed characters rather than entry count: an entry costs ~8
// bytes per visible character (the Int32Array) plus the text, so entry count
// says nothing about what is retained. 1M characters keeps a long conversation
// resident for a few MB.
export const INDEXED_CHAR_BUDGET = 1_000_000;

interface CacheEntry {
  index: SearchIndex;
  chars: number;
}

const cache = new Map<string, CacheEntry>();
let cachedChars = 0;

export const getSearchIndex = (markdown: string): SearchIndex => {
  const hit = cache.get(markdown);
  if (hit) {
    cache.delete(markdown);
    cache.set(markdown, hit);
    return hit.index;
  }

  const index = buildSearchIndex(markdown);
  const chars = index.segments.reduce(
    (total, segment) => total + segment.text.length,
    0,
  );
  cache.set(markdown, {index, chars});
  cachedChars += chars;

  while (cachedChars > INDEXED_CHAR_BUDGET && cache.size > 1) {
    const oldest = cache.keys().next().value as string;
    cachedChars -= cache.get(oldest)?.chars ?? 0;
    cache.delete(oldest);
  }
  return index;
};

/** Test seam: the cache is process-global and otherwise unobservable. */
export const __cacheStats = () => ({
  entries: cache.size,
  chars: cachedChars,
});

export const __resetCache = () => {
  cache.clear();
  cachedChars = 0;
};

const escapeRegExp = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Matching runs on the segment text directly (never a transformed copy), so
 * `index`/`length` stay aligned with `spans`. Case-insensitivity comes from
 * the regex rather than a `toLowerCase()` pass, which can change length.
 */
export const findMatchRuns = (
  index: SearchIndex,
  query: string,
): MatchRuns[] => {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }
  const pattern = new RegExp(escapeRegExp(trimmed), 'gi');
  const matches: MatchRuns[] = [];

  for (const segment of index.segments) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(segment.text))) {
      if (match[0].length === 0) {
        pattern.lastIndex++;
        continue;
      }
      const from = match.index;
      const to = from + match[0].length;

      const runs: MatchRuns = [];
      let runStart = segment.spans[from * 2];
      let runEnd = segment.spans[from * 2 + 1];
      for (let i = from + 1; i < to; i++) {
        const start = segment.spans[i * 2];
        const end = segment.spans[i * 2 + 1];
        if (start === runEnd) {
          runEnd = end;
        } else {
          runs.push([runStart, runEnd]);
          runStart = start;
          runEnd = end;
        }
      }
      runs.push([runStart, runEnd]);
      matches.push(runs);
    }
  }
  return matches;
};

export const countMatches = (markdown: string, query: string): number =>
  query.trim() ? findMatchRuns(getSearchIndex(markdown), query).length : 0;

/**
 * `marked()` output with every match wrapped in `<mark>`. When `activeOrdinal`
 * names one of this chunk's occurrences, that one is marked
 * `<mark class="search-active">` so the navigator's current target reads
 * differently from the rest.
 */
export const highlightMatches = (
  markdown: string,
  query: string,
  activeOrdinal?: number,
): string => {
  // Search closed is the overwhelmingly common case, and it needs no span map.
  // Building one here would retain a per-character index for every message
  // ever rendered.
  if (!query.trim()) {
    return marked(markdown) as string;
  }
  const index = getSearchIndex(markdown);
  const matches = findMatchRuns(index, query);
  if (matches.length === 0) {
    return index.html;
  }

  const runs = matches
    .flatMap((match, ordinal) =>
      match.map(([start, end]) => ({
        start,
        end,
        active: ordinal === activeOrdinal,
      })),
    )
    .sort((a, b) => a.start - b.start);

  let out = '';
  let cursor = 0;
  for (const {start, end, active} of runs) {
    const tag = active ? '<mark class="search-active">' : '<mark>';
    out += `${index.html.slice(cursor, start)}${tag}${index.html.slice(
      start,
      end,
    )}</mark>`;
    cursor = end;
  }
  return out + index.html.slice(cursor);
};
