import * as RNFS from '@dr.pogodin/react-native-fs';
import {validate, version} from 'uuid';

import type {PageRange} from './types';

export class DocumentPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocumentPathError';
  }
}

/** Document ids are minted as uuid v4; anything else came from outside. */
export const isDocumentId = (id: unknown): id is string =>
  typeof id === 'string' && validate(id) && version(id) === 4;

export const isValidPageRange = (range: unknown): range is PageRange => {
  const {from, to} = (range ?? {}) as Partial<PageRange>;
  return (
    Number.isInteger(from) &&
    Number.isInteger(to) &&
    (from as number) >= 1 &&
    (from as number) <= (to as number)
  );
};

export const documentsRoot = (): string =>
  `${RNFS.DocumentDirectoryPath}/documents`;

/** Throws unless the path is strictly inside the documents root. */
export const assertContained = (path: string): string => {
  const root = `${documentsRoot()}/`;
  const rest = path.startsWith(root) ? path.slice(root.length) : '';
  const segments = rest.split('/');
  if (
    !rest ||
    rest.includes('\\') ||
    segments.some(segment => !segment || segment === '.' || segment === '..')
  ) {
    throw new DocumentPathError(`not a document path: ${path}`);
  }
  return path;
};

export const docDir = (id: string): string => {
  if (!isDocumentId(id)) {
    throw new DocumentPathError(`not a document id: ${JSON.stringify(id)}`);
  }
  return assertContained(`${documentsRoot()}/${id}`);
};

export const sourceFile = (id: string, extension: string): string => {
  if (!/^[a-z0-9]+$/i.test(extension)) {
    throw new DocumentPathError(
      `unsafe extension: ${JSON.stringify(extension)}`,
    );
  }
  return `${docDir(id)}/source.${extension}`;
};

export const textFile = (id: string, range?: PageRange): string => {
  if (range !== undefined && !isValidPageRange(range)) {
    throw new DocumentPathError(`invalid page range: ${JSON.stringify(range)}`);
  }
  return `${docDir(id)}/text.${range ? `${range.from}-${range.to}` : 'all'}.json`;
};
