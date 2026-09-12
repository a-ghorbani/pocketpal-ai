/**
 * Shared extraction of wired-locale keys from src/locales/index.ts source.
 * Plain-Node scripts cannot require index.ts (TypeScript, imports dayjs),
 * so the registry block is parsed from source. Entries must open their
 * object literal on the entry line, so nested fields (e.g. displayName)
 * cannot leak into the list. Returns null when the block didn't match or
 * yielded no wired locales, so callers can hard-fail instead of silently
 * operating on a subset (or on nothing).
 */
const REGISTRY_BLOCK =
  /const languageRegistry\s*=\s*\{([\s\S]*?)\}\s*(?:as const|;)/;

function extractRegistryLanguages(indexSource) {
  const registryMatch = indexSource.match(REGISTRY_BLOCK);
  if (!registryMatch) {
    return null;
  }
  const languages = [...registryMatch[1].matchAll(/^[ \t]*(\w+)\s*:\s*\{/gm)]
    .map(m => m[1])
    .filter(l => l !== 'en');
  return languages.length > 0 ? languages : null;
}

module.exports = {extractRegistryLanguages};
