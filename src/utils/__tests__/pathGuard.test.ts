import * as RNFS from '@dr.pogodin/react-native-fs';

import {isModelFilePath, isSafePathSegment} from '../pathGuard';

describe('isSafePathSegment', () => {
  it.each([
    '..',
    '../..',
    '/etc/hosts',
    'file:///data/local/tmp/x',
    '',
    '.',
    'a\\b',
    'a\u0000b',
    7,
    undefined,
  ])('rejects %j', input => {
    expect(isSafePathSegment(input)).toBe(false);
  });

  it.each(['x.gguf', 'a..b', 'My Model (1).gguf'])('accepts %j', input => {
    expect(isSafePathSegment(input)).toBe(true);
  });

  it('accepts a backslash only when allowed', () => {
    expect(isSafePathSegment('a\\b.gguf', {allowBackslash: true})).toBe(true);
    expect(isSafePathSegment('..', {allowBackslash: true})).toBe(false);
    expect(isSafePathSegment('a/b', {allowBackslash: true})).toBe(false);
  });
});

describe('isModelFilePath', () => {
  const docs = RNFS.DocumentDirectoryPath;

  it.each([
    `${docs}/models/hf/a/r/x.gguf`,
    `${docs}/models/local/a\\b.gguf`,
    `${docs}/x.gguf`,
  ])('accepts %j', path => {
    expect(isModelFilePath(path)).toBe(true);
  });

  it.each([
    `${docs}/models/hf/../../x.db`,
    `${docs}/models/local/..`,
    `${docs}/models/local/a\u0000b.gguf`,
    `${docs}/models/`,
    `${docs}/models`,
    `${docs}/x.db`,
    `${docs}/a\\b.gguf`,
    `${docs}/../x.gguf`,
    '/etc/x.gguf',
    'file:///data/local/tmp/x.gguf',
    '',
  ])('rejects %j', path => {
    expect(isModelFilePath(path)).toBe(false);
  });
});
