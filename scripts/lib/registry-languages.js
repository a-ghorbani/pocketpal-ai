/**
 * Shared extraction of wired-locale keys from src/locales/index.ts source.
 * Plain-Node scripts cannot require index.ts (TypeScript, imports dayjs),
 * so the registry block is parsed from source. Returns null when the
 * block no longer matches, so callers can hard-fail instead of silently
 * operating on a subset.
 */
const REGISTRY_BLOCK =
  /const languageRegistry\s*=\s*\{([\s\S]*?)\}\s*(?:as const|;)/;

function extractRegistryLanguages(indexSource) {
  const registryMatch = indexSource.match(REGISTRY_BLOCK);
  if (!registryMatch) {
    return null;
  }
  return [...registryMatch[1].matchAll(/^\s*(\w+)\s*:/gm)]
    .map(m => m[1])
    .filter(l => l !== 'en');
}

module.exports = {extractRegistryLanguages};
