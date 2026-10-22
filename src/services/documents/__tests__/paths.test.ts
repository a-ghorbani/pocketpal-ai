import * as RNFS from '@dr.pogodin/react-native-fs';

import {
  DocumentPathError,
  assertContained,
  docDir,
  isDocumentId,
  isValidPageRange,
  sourceFile,
  textFile,
} from '../paths';
import {docId} from '../../../../jest/fixtures/documentIds';

const ID = docId('paths');
const ROOT = '/path/to/documents/documents';
const BAD_IDS = [
  '..',
  '../..',
  '../models',
  '/abs/path',
  '',
  'a/b',
  'a\\b',
  '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
];

describe('document paths', () => {
  beforeEach(() => jest.clearAllMocks());

  it('forms paths for a uuid v4 id', () => {
    expect(docDir(ID)).toBe(`${ROOT}/${ID}`);
    expect(sourceFile(ID, 'pdf')).toBe(`${ROOT}/${ID}/source.pdf`);
    expect(textFile(ID)).toBe(`${ROOT}/${ID}/text.all.json`);
    expect(textFile(ID, {from: 3, to: 5})).toBe(`${ROOT}/${ID}/text.3-5.json`);
  });

  it.each(BAD_IDS)('rejects ids that are not uuid v4: %j', id => {
    expect(isDocumentId(id)).toBe(false);
    expect(() => docDir(id)).toThrow(DocumentPathError);
    expect(() => textFile(id)).toThrow(DocumentPathError);
    expect(() => sourceFile(id, 'pdf')).toThrow(DocumentPathError);
    Object.values(RNFS).forEach(fn => {
      if (jest.isMockFunction(fn)) {
        expect(fn).not.toHaveBeenCalled();
      }
    });
  });

  it.each([
    [{from: '../x', to: 1}],
    [{from: 1.5, to: 2}],
    [{from: 0, to: 2}],
    [{from: 5, to: 3}],
  ])('rejects an invalid page range %j', range => {
    expect(isValidPageRange(range as any)).toBe(false);
    expect(() => textFile(ID, range as any)).toThrow(DocumentPathError);
  });

  it.each(['', 'p/df', 'p\\df', 'p.df'])(
    'rejects an unsafe extension %j',
    extension => {
      expect(() => sourceFile(ID, extension)).toThrow(DocumentPathError);
    },
  );

  it('asserts containment under the documents root', () => {
    expect(() => assertContained(`${ROOT}/${ID}`)).not.toThrow();
    for (const path of [
      ROOT,
      `${ROOT}/..`,
      `${ROOT}/${ID}/../..`,
      '/path/to/documents/models',
      `${ROOT}/a\\b`,
      `${ROOT}/./x`,
    ]) {
      expect(() => assertContained(path)).toThrow(DocumentPathError);
    }
  });
});
