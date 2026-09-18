/**
 * The supported JSONPath subset: `$`, `.key`, `[n]` and `[*]`. Hand-written
 * because the input is an untrusted response body and an eval-based library
 * would hand it a parser we do not control.
 */

export type JsonPathResult = {found: true; value: unknown} | {found: false};

type Token =
  | {kind: 'key'; key: string}
  | {kind: 'index'; index: number}
  | {kind: 'wildcard'};

const KEY_TOKEN = /^\.([A-Za-z0-9_$-]+)/;
const INDEX_TOKEN = /^\[(\d+)\]/;
const WILDCARD_TOKEN = /^\[\*\]/;

function tokenize(path: string): Token[] | null {
  if (!path.startsWith('$')) {
    return null;
  }
  let rest = path.slice(1);
  const tokens: Token[] = [];
  while (rest.length > 0) {
    const key = KEY_TOKEN.exec(rest);
    if (key) {
      tokens.push({kind: 'key', key: key[1]});
      rest = rest.slice(key[0].length);
      continue;
    }
    const index = INDEX_TOKEN.exec(rest);
    if (index) {
      tokens.push({kind: 'index', index: Number(index[1])});
      rest = rest.slice(index[0].length);
      continue;
    }
    const wildcard = WILDCARD_TOKEN.exec(rest);
    if (wildcard) {
      tokens.push({kind: 'wildcard'});
      rest = rest.slice(wildcard[0].length);
      continue;
    }
    return null;
  }
  return tokens;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/**
 * Evaluate `path` against `root`. A malformed path, a missing key and an
 * out-of-range index are all misses, which the caller reports as
 * "extract matched nothing".
 */
export function evaluateJsonPath(root: unknown, path: string): JsonPathResult {
  const tokens = tokenize(path);
  if (tokens === null) {
    return {found: false};
  }

  let current: unknown[] = [root];
  let expanded = false;

  for (const token of tokens) {
    if (token.kind === 'wildcard') {
      const next: unknown[] = [];
      for (const value of current) {
        if (!Array.isArray(value)) {
          return {found: false};
        }
        next.push(...value);
      }
      current = next;
      expanded = true;
      continue;
    }

    const next: unknown[] = [];
    for (const value of current) {
      if (token.kind === 'key') {
        if (!isPlainObject(value) || !(token.key in value)) {
          if (!expanded) {
            return {found: false};
          }
          continue;
        }
        next.push(value[token.key]);
        continue;
      }
      if (!Array.isArray(value) || token.index >= value.length) {
        if (!expanded) {
          return {found: false};
        }
        continue;
      }
      next.push(value[token.index]);
    }
    if (!expanded && next.length === 0) {
      return {found: false};
    }
    current = next;
  }

  if (expanded) {
    return {found: true, value: current};
  }
  return current.length > 0 ? {found: true, value: current[0]} : {found: false};
}
