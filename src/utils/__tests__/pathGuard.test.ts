import {
  isContainedPath,
  isSafePathSegment,
  isSafeRelativePath,
} from '../pathGuard';

const NON_STRINGS: unknown[] = [undefined, null, 7, {}, ['a'], true];

describe('isSafePathSegment', () => {
  it.each([
    ['..', false],
    ['../..', false],
    ['/etc/hosts', false],
    ['file:///data/local/tmp/x', false],
    ['', false],
    ['.', false],
    ['a\\b', false],
    ['x.gguf', true],
    ['a..b', true],
    ['..x', true],
  ])('%p → %p', (input, expected) => {
    expect(isSafePathSegment(input)).toBe(expected);
  });

  it.each(NON_STRINGS)('rejects non-string %p', input => {
    expect(isSafePathSegment(input)).toBe(false);
  });
});

describe('isSafeRelativePath', () => {
  it.each([
    ['..', false],
    ['../..', false],
    ['/etc/hosts', false],
    ['file:///data/local/tmp/x', false],
    ['', false],
    ['Q4/z/..', false],
    ['a//b', false],
    ['./x', false],
    ['/x', false],
    ['x/', false],
    ['a\\b', false],
    ['x.gguf', true],
    ['Q4/x.gguf', true],
  ])('%p → %p', (input, expected) => {
    expect(isSafeRelativePath(input)).toBe(expected);
  });

  it.each(NON_STRINGS)('rejects non-string %p', input => {
    expect(isSafeRelativePath(input)).toBe(false);
  });
});

describe('isContainedPath', () => {
  const root = '/data/app/files';

  it.each([
    [`${root}/..`, false],
    [`${root}/../..`, false],
    ['/etc/hosts', false],
    ['file:///data/local/tmp/x', false],
    ['', false],
    [root, false],
    [`${root}/`, false],
    [`${root}/x/..`, false],
    [`${root}x/y`, false],
    [`${root}/a\\b`, false],
    ['/../data/app/files/x', false],
    ['relative/x', false],
    [`${root}/x`, true],
    [`${root}/a/../x`, true],
    [`${root}//./x`, true],
    [`${root}/sub/x.gguf`, true],
  ])('%p → %p', (input, expected) => {
    expect(isContainedPath(root, input)).toBe(expected);
  });

  it('resolves the root as well', () => {
    expect(isContainedPath('/data/app/./files/', `${root}/x`)).toBe(true);
  });

  it('rejects a root with a backslash or that is not absolute', () => {
    expect(isContainedPath('/data\\app', '/data\\app/x')).toBe(false);
    expect(isContainedPath('data/app', 'data/app/x')).toBe(false);
  });

  it.each(NON_STRINGS)('rejects non-string %p', input => {
    expect(isContainedPath(root, input)).toBe(false);
    expect(isContainedPath(input, `${root}/x`)).toBe(false);
  });
});
