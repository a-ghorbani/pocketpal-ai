// A wire-supplied path part (author, repo, filename) flows into both the derived
// download URL and the local model path, so reject anything that is not a plain
// segment (no path separators, no parent-dir traversal).
export const isSafePathSegment = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.length > 0 &&
  !v.includes('/') &&
  !v.includes('\\') &&
  // With separators already disallowed, only an exact "."/".." segment can
  // traverse — reject those, but allow a literal ".." inside a longer name.
  v !== '.' &&
  v !== '..';

export const isSafeRelativePath = (v: unknown): v is string =>
  typeof v === 'string' && v.split('/').every(isSafePathSegment);

const resolveAbsoluteSegments = (path: string): string[] | null => {
  if (!path.startsWith('/') || path.includes('\\')) {
    return null;
  }
  const resolved: string[] = [];
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') {
      continue;
    }
    if (segment === '..') {
      if (resolved.length === 0) {
        return null;
      }
      resolved.pop();
      continue;
    }
    resolved.push(segment);
  }
  return resolved;
};

export const isContainedPath = (root: unknown, path: unknown): boolean => {
  if (typeof root !== 'string' || typeof path !== 'string') {
    return false;
  }
  const rootSegments = resolveAbsoluteSegments(root);
  const pathSegments = resolveAbsoluteSegments(path);
  if (!rootSegments || !pathSegments) {
    return false;
  }
  return (
    pathSegments.length > rootSegments.length &&
    rootSegments.every((segment, i) => pathSegments[i] === segment)
  );
};
