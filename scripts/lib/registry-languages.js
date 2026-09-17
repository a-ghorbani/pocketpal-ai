/**
 * Shared extraction of wired-locale keys from src/locales/index.ts source.
 * Plain-Node scripts cannot require index.ts (TypeScript, imports dayjs),
 * so the registry block is parsed from source. Entries must open their
 * object literal on the entry line, so nested fields (e.g. displayName)
 * cannot leak into the list. Returns null when the block didn't match,
 * yielded no wired locales, or holds a quoted key (a locale this parser
 * would otherwise drop in silence), so callers can hard-fail instead of
 * operating on a subset, on nothing, or on the wrong set.
 */
const REGISTRY_BLOCK =
  /const languageRegistry\s*=\s*\{([\s\S]*?)\}\s*(?:as const|;)/;
const REGISTRY_ENTRY = /^[ \t]*(?:'[^']*'|"[^"]*"|(\w+))\s*:\s*\{/gm;

function extractRegistryLanguages(indexSource) {
  const registryMatch = indexSource.match(REGISTRY_BLOCK);
  if (!registryMatch) {
    return null;
  }
  const entries = [...registryMatch[1].matchAll(REGISTRY_ENTRY)];
  if (entries.some(entry => entry[1] === undefined)) {
    return null;
  }
  const languages = entries.map(entry => entry[1]).filter(l => l !== 'en');
  return languages.length > 0 ? languages : null;
}

module.exports = {extractRegistryLanguages};
