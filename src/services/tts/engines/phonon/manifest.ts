import type {PhononPinnedFile} from '../../constants';

/**
 * Parse an iOS mirror manifest (`path<TAB>size<TAB>sha256` per line).
 * Paths are relative to the bundle folder: absolute paths, `.` / `..` /
 * empty segments, malformed lines and duplicates are rejected, and
 * `bundle.json` must be listed.
 */
export function parseManifest(text: string): PhononPinnedFile[] {
  const out: PhononPinnedFile[] = [];
  const seen = new Set<string>();
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) {
      return;
    }
    const parts = line.split('\t');
    const [name, sizeStr, sha256] = parts;
    const size = Number(sizeStr);
    if (
      parts.length !== 3 ||
      !name ||
      name.startsWith('/') ||
      name.split('/').some(s => s === '' || s === '.' || s === '..') ||
      !Number.isInteger(size) ||
      size < 0 ||
      !/^[0-9a-f]{64}$/.test(sha256 ?? '')
    ) {
      throw new Error(
        `Malformed Phonon manifest line ${i + 1}: ${JSON.stringify(raw)}`,
      );
    }
    if (seen.has(name)) {
      throw new Error(`Duplicate path in Phonon manifest: ${name}`);
    }
    seen.add(name);
    out.push({name, size, sha256: sha256!});
  });
  if (!seen.has('bundle.json')) {
    throw new Error('Phonon manifest lists no bundle.json');
  }
  return out;
}
