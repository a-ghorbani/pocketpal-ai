import * as RNFS from '@dr.pogodin/react-native-fs';

// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

export const isSafePathSegment = (
  v: unknown,
  {allowBackslash = false}: {allowBackslash?: boolean} = {},
): v is string =>
  typeof v === 'string' &&
  v.length > 0 &&
  !v.includes('/') &&
  (allowBackslash || !v.includes('\\')) &&
  !CONTROL_CHARACTER.test(v) &&
  // With separators already disallowed, only an exact "."/".." segment can
  // traverse — reject those, but allow a literal ".." inside a longer name.
  v !== '.' &&
  v !== '..';

// Picked local files may carry a backslash in their name, so it is allowed under models/.
// Very old presets live at the Documents root.
export const isModelFilePath = (path: string): boolean => {
  const documents = `${RNFS.DocumentDirectoryPath}/`;
  const models = `${documents}models/`;
  if (path.startsWith(models)) {
    return path
      .slice(models.length)
      .split('/')
      .every(segment => isSafePathSegment(segment, {allowBackslash: true}));
  }
  const name = path.slice(documents.length);
  return (
    path.startsWith(documents) &&
    isSafePathSegment(name) &&
    name.toLowerCase().endsWith('.gguf')
  );
};
