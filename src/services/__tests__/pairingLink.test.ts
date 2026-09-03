import {parsePairingURL, sameServerUrl} from '../pairingLink';

describe('parsePairingURL — http(s) form', () => {
  it('accepts the real Llama-app QR payload, a web-UI root with a trailing slash', () => {
    expect(parsePairingURL('http://192.168.1.5:9931/')).toEqual({
      url: 'http://192.168.1.5:9931/',
    });
  });

  it('accepts the portless and pathless spellings', () => {
    expect(parsePairingURL('http://host')).toEqual({url: 'http://host/'});
    expect(parsePairingURL('https://host:9931')).toEqual({
      url: 'https://host:9931/',
    });
  });

  it('keeps a non-empty base path', () => {
    expect(parsePairingURL('http://host:9931/llama/')).toEqual({
      url: 'http://host:9931/llama/',
    });
  });

  it('drops query and fragment', () => {
    expect(parsePairingURL('http://host:9931/?a=b#c')).toEqual({
      url: 'http://host:9931/',
    });
  });

  it('rejects a payload carrying userinfo', () => {
    expect(parsePairingURL('http://user:pass@host:9931/')).toBeNull();
  });
});

describe('parsePairingURL — llama:// route form', () => {
  it('decodes url, key and name', () => {
    expect(
      parsePairingURL(
        'llama://add-server?url=http%3A%2F%2F100.101.102.103%3A9931&key=sk-x&name=Studio',
      ),
    ).toEqual({
      url: 'http://100.101.102.103:9931/',
      apiKey: 'sk-x',
      name: 'Studio',
    });
  });

  it('rejects the route when its url is absent or not http(s)', () => {
    expect(parsePairingURL('llama://add-server')).toBeNull();
    expect(
      parsePairingURL('llama://add-server?url=ftp%3A%2F%2Fhost'),
    ).toBeNull();
  });
});

describe('parsePairingURL — llama:// authority form', () => {
  it('defaults the port to 9931', () => {
    expect(parsePairingURL('llama://host')).toEqual({url: 'http://host:9931'});
  });

  it('keeps an explicit port', () => {
    expect(parsePairingURL('llama://192.168.1.5:1234')).toEqual({
      url: 'http://192.168.1.5:1234',
    });
  });

  it('rejects an out-of-range port', () => {
    expect(parsePairingURL('llama://host:70000')).toBeNull();
  });
});

describe('parsePairingURL — schemeless authority form', () => {
  it('accepts host:port', () => {
    expect(parsePairingURL('192.168.1.5:9931')).toEqual({
      url: 'http://192.168.1.5:9931',
    });
  });

  it('rejects portless dotted text, which is text and not a server', () => {
    expect(parsePairingURL('hello.world')).toBeNull();
    expect(parsePairingURL('192.168.1.5')).toBeNull();
  });
});

describe('parsePairingURL — rejected input', () => {
  it.each([
    'llama://add-server?url=', // route with no url
    'pocketpal://hub/run?repo_id=a/b',
    'pocketpal://chat?palId=p1&message=hi',
    'WIFI:S:home;T:WPA;P:secret;;',
    'just some text',
    '',
  ])('returns null for %p', input => {
    expect(parsePairingURL(input)).toBeNull();
  });
});

describe('sameServerUrl', () => {
  it('matches urls differing only by a trailing slash', () => {
    expect(sameServerUrl('http://host:9931', 'http://host:9931/')).toBe(true);
  });

  it('matches a hydrated /v1 record against the same server without it', () => {
    expect(sameServerUrl('http://host:9931/v1', 'http://host:9931')).toBe(true);
  });

  it('separates different hosts, ports and base paths', () => {
    expect(sameServerUrl('http://host:9931', 'http://host:9932')).toBe(false);
    expect(sameServerUrl('http://host:9931', 'http://other:9931')).toBe(false);
    expect(sameServerUrl('http://host:9931/a', 'http://host:9931/b')).toBe(
      false,
    );
  });
});
