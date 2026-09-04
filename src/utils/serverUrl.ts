/**
 * Canonical form of a remote server base url:
 * `scheme://host[:port][/base-path]` — lowercased scheme and host, the
 * default port for the scheme elided, no trailing slash, no `/v1` suffix.
 *
 * Applied at the single `ServerConfig.url` write boundary
 * (`ServerStore.addServer` / `updateServer`). `openai.ts`'s `normalizeUrl`
 * remains request-construction hygiene and is not the canonical form.
 */

const V1_SUFFIX = /\/v1$/;

/**
 * A url this function cannot express in the canonical grammar is returned
 * unchanged rather than rewritten. Userinfo is the case that matters: the
 * canonical form has no slot for it, and dropping it would silently strip
 * credentials from a server the user had working.
 */
export function canonicalizeServerUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return trimmed;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return trimmed;
  }
  if (parsed.username !== '' || parsed.password !== '') {
    return trimmed;
  }
  if (!parsed.hostname) {
    return trimmed;
  }

  const path = parsed.pathname.replace(/\/+$/, '').replace(V1_SUFFIX, '');

  return `${parsed.protocol}//${parsed.host}${path}`;
}
