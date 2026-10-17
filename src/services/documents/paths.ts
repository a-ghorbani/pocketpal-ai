import * as RNFS from '@dr.pogodin/react-native-fs';

import type {PageRange} from './types';

export const documentsRoot = (): string =>
  `${RNFS.DocumentDirectoryPath}/documents`;

export const docDir = (id: string): string => `${documentsRoot()}/${id}`;

export const sourceFile = (id: string, extension: string): string =>
  `${docDir(id)}/source.${extension}`;

export const textFile = (id: string, range?: PageRange): string =>
  `${docDir(id)}/text.${range ? `${range.from}-${range.to}` : 'all'}.json`;
