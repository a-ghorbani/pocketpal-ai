import {
  isContainedPath,
  isSafePathSegment,
  isSafeRelativePath,
} from '../pathGuard';
import {
  EVERY_CONTROL_CHARACTER,
  codePoint,
  withEachControl,
} from '../../../jest/fixtures/controlCharacters';

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

describe('control characters', () => {
  it.each(withEachControl(c => [`${c}ab`, `a${c}b`, `ab${c}`]))(
    'isSafePathSegment rejects %s',
    (_shown, value) => {
      expect(isSafePathSegment(value)).toBe(false);
    },
  );

  it.each(
    withEachControl(c => [
      `${c}Q4/x.gguf`,
      `Q4/a${c}b.gguf`,
      `Q4${c}/x.gguf`,
      `Q4/x.gguf${c}`,
    ]),
  )('isSafeRelativePath rejects %s', (_shown, value) => {
    expect(isSafeRelativePath(value)).toBe(false);
  });

  it.each(withEachControl(c => [`/r/a${c}/x`, `/r/x${c}`, `/r/${c}`]))(
    'isContainedPath rejects path %s',
    (_shown, path) => {
      expect(isContainedPath('/r', path)).toBe(false);
    },
  );

  it.each(withEachControl(c => [`/r${c}`]))(
    'isContainedPath rejects root %s',
    (_shown, root) => {
      expect(isContainedPath(root, `${root}/x`)).toBe(false);
    },
  );

  it.each(withEachControl(c => [`/r/${c}/..`, `/r/a${c}/..`]))(
    'isContainedPath rejects root %s even when .. drops the segment',
    (_shown, root) => {
      expect(isContainedPath(root, '/r/x')).toBe(false);
    },
  );

  it.each(withEachControl(c => [`/r/${c}/../x`, `/r/a${c}/../x`]))(
    'isContainedPath rejects path %s even when .. drops the segment',
    (_shown, path) => {
      expect(isContainedPath('/r', path)).toBe(false);
    },
  );

  it.each(EVERY_CONTROL_CHARACTER.map(c => [codePoint(c), c]))(
    'every guard rejects %s',
    (_shown, c) => {
      expect(isSafePathSegment(`a${c}b`)).toBe(false);
      expect(isSafeRelativePath(`Q4/a${c}b`)).toBe(false);
      expect(isContainedPath('/r', `/r/a${c}b`)).toBe(false);
      expect(isContainedPath(`/r/a${c}b/..`, '/r/x')).toBe(false);
    },
  );

  it.each(['My Model (1).gguf', '模型.gguf', 'a\u0080b', 'a b', 'a~b'])(
    'accepts the plain name %p',
    name => {
      expect(isSafePathSegment(name)).toBe(true);
      expect(isSafeRelativePath(`Q4/${name}`)).toBe(true);
      expect(isContainedPath('/r', `/r/${name}`)).toBe(true);
    },
  );
});
