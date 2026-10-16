/**
 * Pre-flight validation for local model files before handing them to the
 * native llama runtime.
 *
 * Without this, missing/truncated/corrupt files fail deep inside
 * `llama_model_load_from_file` with a generic "failed to load model" error.
 * Each check below throws an actionable message (delete + redownload) so the
 * load screen can tell the user what actually happened.
 */
import * as RNFS from '@dr.pogodin/react-native-fs';
import {formatBytes} from './formatters';

export const GGUF_MAGIC = 'GGUF';

/** Files smaller than this fraction of the expected size are truncated. */
const MIN_SIZE_FRACTION = 0.95;

export interface LocalModelFileToValidate {
  /** Full on-disk path of the entry file (first split part for split models). */
  entryPath: string;
  /** Directory that holds the split parts (ignored for single-file models). */
  storageRoot: string;
  /** Known-good size in bytes, if any (metadata/download record). */
  expectedSize?: number;
  /** Relative part paths for split models, if any. */
  splitParts?: string[];
}

function fileNameOf(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx >= 0 ? path.slice(idx + 1) : path;
}

export async function validateLocalModelFileForLoad({
  entryPath,
  storageRoot,
  expectedSize,
  splitParts,
}: LocalModelFileToValidate): Promise<void> {
  const displayName = fileNameOf(entryPath);

  if (!(await RNFS.exists(entryPath))) {
    throw new Error(
      `Model file not found (${displayName}). Please delete it and download again.`,
    );
  }

  if (splitParts && splitParts.length > 0) {
    const missing: string[] = [];
    for (const part of splitParts) {
      if (!(await RNFS.exists(`${storageRoot}/${part}`))) {
        missing.push(fileNameOf(part));
      }
    }
    if (missing.length > 0) {
      throw new Error(
        `Split model is incomplete: missing ${missing.length} file(s) ` +
          `(${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ', …' : ''}). ` +
          `Please delete it and download again.`,
      );
    }
  }

  let statSize = NaN;
  try {
    statSize = Number((await RNFS.stat(entryPath))?.size);
  } catch {
    // Stat failed after exists() passed (e.g. a racing delete) — treat the
    // size as unknown and let the magic check + native loader decide.
  }
  // Unknown size (some FS backends omit it) skips the size checks — blocking
  // a load on missing metadata would be wrong. An explicit 0-byte file is
  // definitely broken, and the magic check below still applies either way.
  if (Number.isFinite(statSize)) {
    if (statSize <= 0) {
      throw new Error(
        `Model file is empty (${displayName}). Please delete it and download again.`,
      );
    }

    if (
      expectedSize &&
      expectedSize > 0 &&
      statSize < expectedSize * MIN_SIZE_FRACTION
    ) {
      throw new Error(
        `Model download looks incomplete (${formatBytes(statSize)} of ` +
          `${formatBytes(expectedSize)}). Please delete it and download again.`,
      );
    }
  }

  // GGUF files start with the magic bytes "GGUF". An HTML error page or a
  // JSON error saved as .gguf (e.g. a failed mirror download) fails here
  // instead of deep inside the native loader.
  const magic = await RNFS.read(entryPath, GGUF_MAGIC.length, 0, 'ascii');
  if (magic !== GGUF_MAGIC) {
    throw new Error(
      `Model file is not a valid GGUF file (${displayName}). The download ` +
        `may have failed. Please delete it and download again.`,
    );
  }
}
