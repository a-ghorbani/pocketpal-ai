/**
 * Single parse/validate site for a server-pairing payload, shared by the QR
 * scanner and the `llama://` deep link. Pure, never throws, never mutates.
 *
 * Four accepted forms:
 *   http(s)://host[:port][/base-path][/]        the QR the Llama macOS app emits
 *   llama://add-server?url=&key=&name=          our route
 *   llama://host[:port]                         authority shorthand, port 9931 default
 *   host:port                                   schemeless, scanner-reachable only
 *
 * Any other scheme returns null, which is what keeps `pocketpal://` links out
 * of the pairing route on the raw-`Linking` delivery path.
 */

import {canonicalizeServerUrl} from '../utils/serverUrl';

export interface PairingRequest {
  /** Absolute http(s) url as parsed; canonicalised at the write boundary. */
  url: string;
  /** Suggested display name only. */
  name?: string;
  /** In-memory only; reaches the Keychain on confirm, never `ServerConfig`. */
  apiKey?: string;
}

/** Default port for the `llama://` authority form only. */
const LLAMA_DEFAULT_PORT = 9931;

const SCHEME_RE = /^([A-Za-z][A-Za-z0-9+.-]*):/;
const DNS_OR_IPV4_HOST_RE =
  /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*$/;
const BRACKETED_IPV6_RE = /^\[[0-9A-Fa-f:.]+\]$/;

const isHost = (host: string): boolean =>
  BRACKETED_IPV6_RE.test(host) || DNS_OR_IPV4_HOST_RE.test(host);

const isPort = (port: string): boolean => {
  if (!/^\d{1,5}$/.test(port)) {
    return false;
  }
  const value = Number(port);
  return value >= 1 && value <= 65535;
};

/** `host`, `host:port`, `[::1]`, `[::1]:port` — nothing else. */
function splitAuthority(text: string): {host: string; port?: string} | null {
  if (/[/?#@\s]/.test(text) || text === '') {
    return null;
  }

  const bracketed = text.match(/^(\[[^\]]*\])(?::(\d+))?$/);
  if (bracketed) {
    const [, host, port] = bracketed;
    if (
      !BRACKETED_IPV6_RE.test(host) ||
      (port !== undefined && !isPort(port))
    ) {
      return null;
    }
    return {host, port};
  }

  const colon = text.lastIndexOf(':');
  const host = colon === -1 ? text : text.slice(0, colon);
  const port = colon === -1 ? undefined : text.slice(colon + 1);
  if (!isHost(host) || (port !== undefined && !isPort(port))) {
    return null;
  }
  return {host, port};
}

/** The http(s) row: an absolute url with a host, no userinfo, query and fragment dropped. */
function parseHttpUrl(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }
  if (parsed.username !== '' || parsed.password !== '') {
    return null;
  }
  if (!parsed.hostname) {
    return null;
  }

  return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
}

function parseLlamaRoute(raw: string): PairingRequest | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  const url = parseHttpUrl(parsed.searchParams.get('url') ?? '');
  if (!url) {
    return null;
  }

  const name = parsed.searchParams.get('name')?.trim() || undefined;
  const apiKey = parsed.searchParams.get('key')?.trim() || undefined;
  return {url, name, apiKey};
}

function parseLlamaAuthority(
  text: string,
  remainder: string,
): PairingRequest | null {
  if (remainder !== '' && remainder !== '/') {
    return null;
  }
  const authority = splitAuthority(text);
  if (!authority) {
    return null;
  }
  const port = authority.port ?? String(LLAMA_DEFAULT_PORT);
  return {url: `http://${authority.host}:${port}`};
}

export function parsePairingURL(raw: string): PairingRequest | null {
  const text = raw.trim();
  if (!text) {
    return null;
  }

  const scheme = text.match(SCHEME_RE)?.[1].toLowerCase();

  if (scheme === 'http' || scheme === 'https') {
    const url = parseHttpUrl(text);
    return url ? {url} : null;
  }

  if (scheme === 'llama') {
    const rest = text.slice(text.indexOf(':') + 1).replace(/^\/\//, '');
    const authority = rest.split(/[/?#]/)[0];
    return authority.toLowerCase() === 'add-server'
      ? parseLlamaRoute(text)
      : parseLlamaAuthority(authority, rest.slice(authority.length));
  }

  // Schemeless `host:port`. A scheme-looking prefix that is none of the three
  // above still lands here, and fails the authority grammar on its `//`.
  const authority = splitAuthority(text);
  if (!authority?.port) {
    return null;
  }
  return {url: `http://${authority.host}:${authority.port}`};
}

/**
 * True only for the `llama:` scheme. The delivery paths gate on this rather
 * than on a successful parse: the grammar also accepts an absolute http(s) url
 * and a bare `host:port`, which are the scanner's forms, and a router that
 * accepted them would open the pairing sheet for links addressed elsewhere.
 */
export const isPairingLink = (url: string): boolean =>
  SCHEME_RE.exec(url.trim())?.[1].toLowerCase() === 'llama';

/** Duplicate detection: both sides canonicalised, because neither is known to be. */
export function sameServerUrl(a: string, b: string): boolean {
  return canonicalizeServerUrl(a) === canonicalizeServerUrl(b);
}
