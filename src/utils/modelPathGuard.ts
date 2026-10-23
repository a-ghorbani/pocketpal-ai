import * as RNFS from '@dr.pogodin/react-native-fs';

import {MMProjRegex} from './multimodalPatterns';
import {isSafePathSegment, isSafeRelativePath} from './pathGuard';
import {ModelOrigin} from './types';

export const MODEL_PATH_REFUSED = 'Model path is outside the models folder';

const GGUF_SUFFIX = /\.gguf$/i;

const isGgufName = (name: string): boolean => GGUF_SUFFIX.test(name);

export const isModelFilePath = (
  path: unknown,
  {local}: {local: boolean},
): boolean => {
  if (typeof path !== 'string') {
    return false;
  }
  const documentsPrefix = `${RNFS.DocumentDirectoryPath}/`;
  const modelsPrefix = `${documentsPrefix}models/`;
  if (path.startsWith(modelsPrefix)) {
    const relative = path.slice(modelsPrefix.length);
    return isSafeRelativePath(relative) && (local || isGgufName(relative));
  }
  if (path.startsWith(documentsPrefix)) {
    const name = path.slice(documentsPrefix.length);
    return isSafePathSegment(name) && isGgufName(name);
  }
  return false;
};

type UnknownRecord = Record<string, unknown>;

const isObject = (v: unknown): v is UnknownRecord =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isEmpty = (v: unknown): boolean =>
  v === undefined || v === null || v === '';

const isAbsent = (v: unknown): boolean => v === undefined || v === null;

const emptyOr =
  (predicate: (v: unknown) => boolean) =>
  (v: unknown): boolean =>
    isEmpty(v) || predicate(v);

const isHfRepoId = (v: unknown): boolean => {
  if (typeof v !== 'string') {
    return false;
  }
  const segments = v.split('/');
  return segments.length === 2 && segments.every(isSafePathSegment);
};

const isGgufRelativePath = (v: unknown): boolean =>
  isSafeRelativePath(v) && isGgufName(v);

const hasSafeMmprojSiblings = (siblings: unknown): boolean => {
  if (isAbsent(siblings)) {
    return true;
  }
  if (!Array.isArray(siblings)) {
    return false;
  }
  return siblings.every(
    sibling =>
      isObject(sibling) &&
      typeof sibling.rfilename === 'string' &&
      (!MMProjRegex.test(sibling.rfilename) ||
        isSafeRelativePath(sibling.rfilename)),
  );
};

const isValidHfModel = (hfModel: unknown): boolean => {
  if (isAbsent(hfModel)) {
    return true;
  }
  return (
    isObject(hfModel) &&
    emptyOr(isSafePathSegment)(hfModel.author) &&
    isHfRepoId(hfModel.id) &&
    hasSafeMmprojSiblings(hfModel.siblings)
  );
};

const isValidHfModelFile = (hfModelFile: unknown): boolean =>
  isAbsent(hfModelFile) ||
  (isObject(hfModelFile) && isGgufRelativePath(hfModelFile.rfilename));

const PATH_FORMING_ORIGINS: unknown[] = [ModelOrigin.HF, ModelOrigin.PRESET];

const hasSafeOriginFields = (ref: UnknownRecord): boolean =>
  !PATH_FORMING_ORIGINS.includes(ref.origin) ||
  (emptyOr(isSafePathSegment)(ref.author) &&
    emptyOr(isSafePathSegment)(ref.repo) &&
    emptyOr(isSafeRelativePath)(ref.id));

const hasLoadableFilename = (ref: UnknownRecord): boolean =>
  isEmpty(ref.filename) ||
  ref.origin === ModelOrigin.LOCAL ||
  ref.isLocal === true ||
  isGgufName(ref.filename as string);

const LOCAL_MODELS_MARKER = '/models/local/';

const isImportableFullPath = (fullPath: unknown): boolean => {
  if (isEmpty(fullPath)) {
    return true;
  }
  if (
    typeof fullPath !== 'string' ||
    !fullPath.startsWith('/') ||
    !isSafeRelativePath(fullPath.slice(1))
  ) {
    return false;
  }
  const [, localName, ...extra] = fullPath.split(LOCAL_MODELS_MARKER);
  if (localName !== undefined) {
    return extra.length === 0 && isSafePathSegment(localName);
  }
  const modelsPrefix = `${RNFS.DocumentDirectoryPath}/models/`;
  return (
    fullPath.startsWith(modelsPrefix) &&
    isSafePathSegment(fullPath.slice(modelsPrefix.length))
  );
};

export const isValidImportedModelRef = (ref: unknown): boolean => {
  if (isAbsent(ref)) {
    return true;
  }
  return (
    isObject(ref) &&
    emptyOr(isSafeRelativePath)(ref.filename) &&
    hasLoadableFilename(ref) &&
    isValidHfModel(ref.hfModel) &&
    isValidHfModelFile(ref.hfModelFile) &&
    hasSafeOriginFields(ref) &&
    isImportableFullPath(ref.fullPath)
  );
};
