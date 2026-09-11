import {canonicalizeServerUrl} from '../serverUrl';

describe('canonicalizeServerUrl', () => {
  it('strips a trailing slash', () => {
    expect(canonicalizeServerUrl('http://192.168.1.5:9931/')).toBe(
      'http://192.168.1.5:9931',
    );
  });

  it('strips a hand-entered /v1 suffix, which would otherwise 404 every request', () => {
    // The Llama macOS app displays "Base URL: http://host:port/v1", so a user
    // copying what they see persists a base that resolves to /v1/v1/models.
    expect(canonicalizeServerUrl('http://192.168.1.5:9931/v1')).toBe(
      'http://192.168.1.5:9931',
    );
    expect(canonicalizeServerUrl('http://192.168.1.5:9931/v1/')).toBe(
      'http://192.168.1.5:9931',
    );
  });

  it('keeps a base path but strips its /v1 suffix', () => {
    expect(canonicalizeServerUrl('http://host:9931/llama/')).toBe(
      'http://host:9931/llama',
    );
    expect(canonicalizeServerUrl('http://host:9931/llama/v1')).toBe(
      'http://host:9931/llama',
    );
  });

  it('lowercases scheme and host and elides the default port', () => {
    expect(canonicalizeServerUrl('HTTP://Host.Local:80/')).toBe(
      'http://host.local',
    );
    expect(canonicalizeServerUrl('https://host:443')).toBe('https://host');
  });

  it('keeps an explicit non-default port', () => {
    expect(canonicalizeServerUrl('http://host:9931')).toBe('http://host:9931');
  });

  it('drops query and fragment', () => {
    expect(canonicalizeServerUrl('http://host:9931/?a=b#c')).toBe(
      'http://host:9931',
    );
  });

  it('normalises a bracketed IPv6 authority', () => {
    expect(canonicalizeServerUrl('http://[::1]:9931/v1')).toBe(
      'http://[::1]:9931',
    );
  });

  it('is idempotent', () => {
    const once = canonicalizeServerUrl('http://host:9931/v1/');
    expect(canonicalizeServerUrl(once)).toBe(once);
  });

  it('returns unexpressible urls unchanged rather than rewriting them', () => {
    expect(canonicalizeServerUrl('not a url')).toBe('not a url');
    expect(canonicalizeServerUrl('ftp://host/x')).toBe('ftp://host/x');
    expect(canonicalizeServerUrl('http://u:p@host:9931/')).toBe(
      'http://u:p@host:9931/',
    );
  });
});
