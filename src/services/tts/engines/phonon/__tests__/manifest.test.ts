import {parseManifest} from '../manifest';

const SHA = 'c'.repeat(64);
const line = (path: string, size = '1', sha = SHA) =>
  `${path}\t${size}\t${sha}`;

describe('parseManifest', () => {
  it('parses path, size and sha256 per line and skips blank lines', () => {
    const text = [line('bundle.json', '10'), '', line('a/b.bin', '20')].join(
      '\r\n',
    );
    expect(parseManifest(text)).toEqual([
      {name: 'bundle.json', size: 10, sha256: SHA},
      {name: 'a/b.bin', size: 20, sha256: SHA},
    ]);
  });

  it.each([
    ['an absolute path', line('/etc/passwd')],
    ['a parent segment', line('a/../b')],
    ['a dot segment', line('./b')],
    ['an empty segment', line('a//b')],
    ['a missing column', 'bundle.json\t1'],
    ['an extra column', `${line('x')}\textra`],
    ['a non-integer size', line('x', '1.5')],
    ['a negative size', line('x', '-1')],
    ['an uppercase sha256', line('x', '1', 'C'.repeat(64))],
    ['a short sha256', line('x', '1', 'c'.repeat(63))],
  ])('rejects %s', (_label, bad) => {
    expect(() => parseManifest([line('bundle.json'), bad].join('\n'))).toThrow(
      /Malformed/,
    );
  });

  it('rejects a duplicate path', () => {
    expect(() =>
      parseManifest([line('bundle.json'), line('bundle.json')].join('\n')),
    ).toThrow(/Duplicate/);
  });

  it('requires bundle.json', () => {
    expect(() => parseManifest(line('model.bin'))).toThrow(/bundle\.json/);
  });
});
