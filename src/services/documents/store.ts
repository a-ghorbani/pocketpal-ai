import * as RNFS from '@dr.pogodin/react-native-fs';
import {keepLocalCopy} from '@react-native-documents/picker';
import {v4 as uuidv4} from 'uuid';
import 'react-native-get-random-values';

import NativePdfText from '../../specs/NativePdfText';

import {estimateDocTokens} from './estimate';
import {dropDocumentIndexes} from './retrieve';
import {
  assertContained,
  docDir,
  documentsRoot,
  isDocumentId,
  isValidPageRange,
  sourceFile,
  textFile,
} from './paths';
import {documentKey, renderDocumentBlock} from './render';
import {
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENT_CHARS,
  MAX_RANGE_PAGES,
  MAX_TEXT_DOCUMENT_BYTES,
  type DocumentKind,
  type DocumentRef,
  type DocumentRefusalReason,
  type DocumentTextFile,
  type PageRange,
  type RangeLimitReason,
} from './types';

export interface PickedDocument {
  uri: string;
  name: string | null;
  size: number | null;
  type?: string | null;
  isVirtual?: boolean | null;
  convertibleToMimeTypes?: Array<{mimeType: string}> | null;
}

export interface DocumentCounting {
  modelId: string;
  tokenize: (text: string) => Promise<number>;
}

export type DocumentResult =
  | {status: 'ready'; ref: DocumentRef}
  | {status: 'needs_range'; ref: DocumentRef; rangeLimit: RangeLimitReason}
  | {status: 'refused'; reason: DocumentRefusalReason};

export type DocumentTexts = Map<string, string[] | 'missing'>;

export const TEXT_EXTENSIONS: ReadonlySet<string> = new Set([
  'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'yaml', 'yml', 'xml',
  'html', 'htm', 'log', 'ini', 'toml', 'js', 'jsx', 'mjs', 'cjs', 'ts',
  'tsx', 'py', 'java', 'kt', 'kts', 'c', 'h', 'cpp', 'hpp', 'cc', 'cs',
  'go', 'rs', 'rb', 'php', 'swift', 'm', 'mm', 'sh', 'bash', 'zsh', 'sql',
  'css', 'scss', 'less', 'r', 'lua', 'pl', 'dart', 'scala', 'vue',
  'svelte', 'gradle', 'properties', 'cfg', 'conf', 'tex', 'rst', 'adoc',
  'org', 'srt', 'vtt',
]); // prettier-ignore

const TEXT_MIME_TYPES: ReadonlySet<string> = new Set([
  'application/json',
  'application/xml',
  'application/yaml',
  'application/x-yaml',
  'application/toml',
  'application/javascript',
  'application/x-sh',
  'application/sql',
]);

const NUL_PROBE_BYTES = 8192;

const bytesOf = (base64: string): number[] =>
  Array.from(atob(base64), char => char.charCodeAt(0));

/** The byte order a UTF-16 byte order mark announces, if the file starts with one. */
const utf16Order = ([first, second]: number[]): 'le' | 'be' | undefined =>
  first === 0xff && second === 0xfe
    ? 'le'
    : first === 0xfe && second === 0xff
      ? 'be'
      : undefined;

/** Windows-1252 code points for bytes 0x80–0x9F; the rest match Latin-1. */
const CP1252_HIGH = [
  0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030,
  0x160, 0x2039, 0x152, 0x8d, 0x17d, 0x8f, 0x90, 0x2018, 0x2019, 0x201c,
  0x201d, 0x2022, 0x2013, 0x2014, 0x2dc, 0x2122, 0x161, 0x203a, 0x153, 0x9d,
  0x17e, 0x178,
]; // prettier-ignore

const decodeWindows1252 = (bytes: number[]): string => {
  let text = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    text += String.fromCharCode(
      ...bytes
        .slice(i, i + 8192)
        .map(byte =>
          byte >= 0x80 && byte <= 0x9f ? CP1252_HIGH[byte - 0x80] : byte,
        ),
    );
  }
  return text;
};

/** True when the bytes hold the UTF-8 encoding of U+FFFD itself. */
const hasReplacementCharacter = (bytes: number[]): boolean =>
  bytes.some(
    (byte, i) =>
      byte === 0xef && bytes[i + 1] === 0xbf && bytes[i + 2] === 0xbd,
  );

/**
 * Reads a text file as UTF-8; a file that is not valid UTF-8 (decoding added
 * replacement characters it did not contain) is read as Windows-1252.
 */
const readTextAsUtf8OrWindows1252 = async (path: string): Promise<string> => {
  const text = await RNFS.readFile(path, 'utf8');
  if (!text.includes('\uFFFD')) {
    return text;
  }
  const bytes = bytesOf(await RNFS.readFile(path, 'base64'));
  return hasReplacementCharacter(bytes) ? text : decodeWindows1252(bytes);
};

const decodeUtf16 = (bytes: number[], order: 'le' | 'be'): string => {
  const units: number[] = [];
  for (let i = 2; i + 1 < bytes.length; i += 2) {
    units.push(
      order === 'le'
        ? bytes[i] + bytes[i + 1] * 256
        : bytes[i] * 256 + bytes[i + 1],
    );
  }
  let text = '';
  for (let i = 0; i < units.length; i += 8192) {
    text += String.fromCharCode(...units.slice(i, i + 8192));
  }
  return text;
};

class Refusal extends Error {
  constructor(readonly reason: DocumentRefusalReason) {
    super(reason);
  }
}

const importHolds = new Set<string>();
const composerHolds = new Set<string>();
const sendHolds = new Set<string>();
let releaseEpoch = 0;

const unhold = (set: Set<string>, ids: Iterable<string>) => {
  for (const id of ids) {
    if (set.delete(id)) {
      releaseEpoch += 1;
    }
  }
};

export const isHeld = (id: string): boolean =>
  importHolds.has(id) || composerHolds.has(id) || sendHolds.has(id);

export const setComposerHeld = (ids: string[]): void => {
  const next = new Set(ids);
  unhold(
    composerHolds,
    [...composerHolds].filter(id => !next.has(id)),
  );
  next.forEach(id => composerHolds.add(id));
};

export const holdForSend = (ids: string[]): void => {
  ids.forEach(id => sendHolds.add(id));
};

export const releaseSendHold = (ids: string[]): void => {
  unhold(sendHolds, ids);
};

export const releaseImportHold = (id: string): void => {
  unhold(importHolds, [id]);
};

const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
};

const extensionForType = (type: string | null | undefined): string => {
  const mime = type?.split(';')[0].trim().toLowerCase() ?? '';
  if (mime === 'application/pdf') {
    return 'pdf';
  }
  return mime.startsWith('text/') || TEXT_MIME_TYPES.has(mime) ? 'txt' : '';
};

const isDocumentExtension = (extension: string): boolean =>
  extension === 'pdf' || TEXT_EXTENSIONS.has(extension);

const classify = (extension: string): DocumentKind => {
  if (extension === 'pdf') {
    return 'pdf';
  }
  if (TEXT_EXTENSIONS.has(extension)) {
    return 'text';
  }
  throw new Refusal('unsupported_type');
};

const virtualTarget = (
  picked: PickedDocument,
): {mimeType: string; extension: string} => {
  const offered = (picked.convertibleToMimeTypes ?? []).map(t => t.mimeType);
  if (offered.includes('application/pdf')) {
    return {mimeType: 'application/pdf', extension: 'pdf'};
  }
  if (offered.includes('text/plain')) {
    return {mimeType: 'text/plain', extension: 'txt'};
  }
  throw new Refusal('unsupported_type');
};

const pathOfLocalUri = (uri: string): string =>
  decodeURIComponent(uri.replace(/^file:\/\//, ''));

const parentDir = (path: string): string =>
  path.slice(0, path.lastIndexOf('/'));

/** iOS reports the container under /var or /private/var for the same dir. */
const withoutPrivate = (path: string): string =>
  path.replace(/^\/private(?=\/)/, '');

const isStagingDir = (dir: string): boolean =>
  withoutPrivate(parentDir(dir)) === withoutPrivate(RNFS.CachesDirectoryPath);

const copyIntoStore = async (
  picked: PickedDocument,
  fileName: string,
  destination: string,
  convertVirtualFileToType?: string,
): Promise<void> => {
  let staged: string | undefined;
  try {
    const [entry] = await keepLocalCopy({
      files: [{uri: picked.uri, fileName, convertVirtualFileToType}],
      destination: 'cachesDirectory',
    });
    if (entry.status !== 'success') {
      throw new Refusal('copy_failed');
    }
    staged = pathOfLocalUri(entry.localUri);
    await RNFS.moveFile(staged, assertContained(destination));
  } catch (error) {
    throw error instanceof Refusal ? error : new Refusal('copy_failed');
  } finally {
    if (staged) {
      const stagingDir = parentDir(staged);
      if (isStagingDir(stagingDir)) {
        await RNFS.unlink(stagingDir).catch(() => {});
      } else {
        console.warn('[documents] staging dir outside caches left in place');
      }
    }
  }
};

const requirePdfText = () => {
  if (!NativePdfText) {
    throw new Refusal('pdf_unavailable');
  }
  return NativePdfText;
};

const extractPdf = async (
  path: string,
  from: number,
  to: number,
): Promise<{pageCount: number; pages: string[]}> => {
  const pdf = requirePdfText();
  try {
    return await pdf.extractPages(path, from, to);
  } catch (error) {
    throw new Refusal(
      (error as {code?: string})?.code === 'E_PDF_ENCRYPTED'
        ? 'pdf_encrypted'
        : 'pdf_unreadable',
    );
  }
};

const hasText = (pages: string[]) => pages.some(page => page.trim() !== '');

const countedRef = async (
  ref: DocumentRef,
  pages: string[],
  counting?: DocumentCounting,
): Promise<DocumentRef> => {
  const block = renderDocumentBlock(ref, pages);
  const counted: DocumentRef = {
    ...ref,
    charCount: block.length,
    tokenEstimate: estimateDocTokens(block),
    tokenCount: undefined,
  };
  if (counting) {
    try {
      counted.tokenCount = {
        modelId: counting.modelId,
        n: await counting.tokenize(block),
      };
    } catch {
      // Context released mid-count: the estimate stands.
    }
  }
  return counted;
};

const writeTextFile = (path: string, firstPage: number, pages: string[]) => {
  const file: DocumentTextFile = {version: 1, firstPage, pages};
  return RNFS.writeFile(assertContained(path), JSON.stringify(file), 'utf8');
};

const readTextFile = async (path: string): Promise<string[]> => {
  const file = JSON.parse(await RNFS.readFile(path, 'utf8')) as
    | DocumentTextFile
    | undefined;
  if (!file || !Array.isArray(file.pages)) {
    throw new Error('invalid document text file');
  }
  return file.pages;
};

const importPdf = async (
  ref: DocumentRef,
  path: string,
  counting?: DocumentCounting,
): Promise<DocumentResult> => {
  const {pageCount} = await extractPdf(path, 1, 0);
  const probed: DocumentRef = {...ref, pageCount};
  if (pageCount > MAX_RANGE_PAGES) {
    return {status: 'needs_range', ref: probed, rangeLimit: 'too_many_pages'};
  }
  const {pages} = await extractPdf(path, 1, pageCount);
  if (!hasText(pages)) {
    throw new Refusal('no_text');
  }
  const counted = await countedRef(probed, pages, counting);
  if (counted.charCount > MAX_DOCUMENT_CHARS) {
    return {status: 'needs_range', ref: probed, rangeLimit: 'too_many_chars'};
  }
  await writeTextFile(textFile(ref.id), 1, pages);
  return {status: 'ready', ref: counted};
};

const importText = async (
  ref: DocumentRef,
  path: string,
  counting?: DocumentCounting,
): Promise<DocumentResult> => {
  if (ref.byteSize > MAX_TEXT_DOCUMENT_BYTES) {
    throw new Refusal('text_too_long');
  }
  const order = utf16Order(bytesOf(await RNFS.read(path, 2, 0, 'base64')));
  if (!order) {
    const probe = await RNFS.read(path, NUL_PROBE_BYTES, 0, 'ascii');
    if (probe.includes('\u0000')) {
      throw new Refusal('binary');
    }
  }
  const pages = [
    order
      ? decodeUtf16(bytesOf(await RNFS.readFile(path, 'base64')), order)
      : await readTextAsUtf8OrWindows1252(path),
  ];
  if (!hasText(pages)) {
    throw new Refusal('no_text');
  }
  const counted = await countedRef(ref, pages, counting);
  if (counted.charCount > MAX_DOCUMENT_CHARS) {
    throw new Refusal('text_too_long');
  }
  await writeTextFile(textFile(ref.id), 1, pages);
  return {status: 'ready', ref: counted};
};

/**
 * Copies, extracts and counts one picked file. A `ready` or `needs_range`
 * result leaves the id import-held: the caller adds its chip, then calls
 * `releaseImportHold`.
 */
export const importDocument = async (
  picked: PickedDocument,
  counting?: DocumentCounting,
): Promise<DocumentResult> => {
  const id = uuidv4();
  importHolds.add(id);
  try {
    if ((picked.size ?? 0) > MAX_DOCUMENT_BYTES) {
      throw new Refusal('too_large');
    }
    const virtual = picked.isVirtual ? virtualTarget(picked) : undefined;
    const displayName = picked.name ?? 'document';
    const stagedName = virtual
      ? `${displayName.replace(/\.[^.]*$/, '')}.${virtual.extension}`
      : displayName;
    const named = extensionOf(stagedName);
    const extension = isDocumentExtension(named)
      ? named
      : extensionForType(picked.type) || named;
    const kind = classify(extension);
    if (kind === 'pdf') {
      requirePdfText();
    }

    await RNFS.mkdir(assertContained(docDir(id)));
    const path = sourceFile(id, extension);
    await copyIntoStore(picked, `source.${extension}`, path, virtual?.mimeType);

    const byteSize = Number((await RNFS.stat(path)).size);
    if (byteSize > MAX_DOCUMENT_BYTES) {
      throw new Refusal('too_large');
    }
    const ref: DocumentRef = {
      id,
      name: displayName,
      kind,
      byteSize,
      charCount: 0,
      tokenEstimate: 0,
    };
    return kind === 'pdf'
      ? await importPdf(ref, path, counting)
      : await importText(ref, path, counting);
  } catch (error) {
    await RNFS.unlink(assertContained(docDir(id))).catch(() => {});
    releaseImportHold(id);
    if (error instanceof Refusal) {
      return {status: 'refused', reason: error.reason};
    }
    console.warn('[documents] import failed', error);
    return {status: 'refused', reason: 'copy_failed'};
  }
};

/**
 * Returns a new composer ref limited to `from..to`. Range text files are
 * written once and never rewritten, so persisted refs keep their pages.
 */
export const setDocumentPageRange = async (
  ref: DocumentRef,
  from: number,
  to: number,
  counting?: DocumentCounting,
): Promise<DocumentResult> => {
  const pageRange: PageRange = {from, to};
  if (!isDocumentId(ref.id) || !isValidPageRange(pageRange)) {
    return {status: 'refused', reason: 'pdf_unreadable'};
  }
  const ranged: DocumentRef = {...ref, pageRange, mode: undefined};
  if (to - from + 1 > MAX_RANGE_PAGES) {
    return {status: 'needs_range', ref: ranged, rangeLimit: 'too_many_pages'};
  }
  const path = textFile(ref.id, pageRange);
  try {
    const existing = (await RNFS.exists(path))
      ? await readTextFile(path)
      : undefined;
    const pages =
      existing ?? (await extractPdf(sourceFile(ref.id, 'pdf'), from, to)).pages;
    if (!hasText(pages)) {
      return {status: 'refused', reason: 'no_text'};
    }
    const counted = await countedRef(ranged, pages, counting);
    if (counted.charCount > MAX_DOCUMENT_CHARS) {
      return {status: 'needs_range', ref: ranged, rangeLimit: 'too_many_chars'};
    }
    if (!existing) {
      await writeTextFile(path, from, pages);
    }
    return {status: 'ready', ref: counted};
  } catch (error) {
    return {
      status: 'refused',
      reason: error instanceof Refusal ? error.reason : 'pdf_unreadable',
    };
  }
};

const textPathOf = (ref: DocumentRef) => textFile(ref.id, ref.pageRange);

const uniqueByKey = (refs: DocumentRef[]) => [
  ...new Map(refs.map(ref => [documentKey(ref), ref])).values(),
];

export const loadDocumentTexts = async (
  refs: DocumentRef[],
): Promise<DocumentTexts> => {
  const texts: DocumentTexts = new Map();
  await Promise.all(
    uniqueByKey(refs).map(async ref => {
      try {
        texts.set(documentKey(ref), await readTextFile(textPathOf(ref)));
      } catch {
        texts.set(documentKey(ref), 'missing');
      }
    }),
  );
  return texts;
};

export const findMissingDocuments = async (
  refs: DocumentRef[],
): Promise<Set<string>> => {
  const missing = new Set<string>();
  await Promise.all(
    uniqueByKey(refs).map(async ref => {
      const exists = await Promise.resolve()
        .then(() => RNFS.exists(textPathOf(ref)))
        .catch(() => false);
      if (!exists) {
        missing.add(documentKey(ref));
      }
    }),
  );
  return missing;
};

type ReferencedIds = () => Promise<Set<string>>;

const deleteUnlive = async (
  candidates: string[],
  getReferencedIds: ReferencedIds,
): Promise<void> => {
  let epoch = releaseEpoch;
  const settledReferences = async (): Promise<Set<string>> => {
    let ids: Set<string>;
    do {
      epoch = releaseEpoch;
      ids = await getReferencedIds();
    } while (epoch !== releaseEpoch);
    return ids;
  };
  let referenced = await settledReferences();
  for (const id of candidates) {
    if (epoch !== releaseEpoch) {
      referenced = await settledReferences();
    }
    if (!isDocumentId(id) || referenced.has(id) || isHeld(id)) {
      continue;
    }
    try {
      await RNFS.unlink(assertContained(docDir(id)));
      dropDocumentIndexes(id);
    } catch (error) {
      console.warn('[documents] delete failed', id, error);
    }
  }
};

export const releaseDocuments = async (
  ids: string[],
  getReferencedIds: ReferencedIds,
): Promise<void> => {
  const existing: string[] = [];
  for (const id of new Set(ids)) {
    if (
      isDocumentId(id) &&
      (await RNFS.exists(docDir(id)).catch(() => false))
    ) {
      existing.push(id);
    }
  }
  if (existing.length > 0) {
    await deleteUnlive(existing, getReferencedIds);
  }
};

export const sweepOrphanDocuments = async (
  getReferencedIds: ReferencedIds,
): Promise<void> => {
  if (!(await RNFS.exists(documentsRoot()))) {
    return;
  }
  const entries = await RNFS.readDir(documentsRoot());
  const dirs = entries
    .filter(entry => entry.isDirectory() && isDocumentId(entry.name))
    .map(entry => entry.name);
  if (dirs.length > 0) {
    await deleteUnlive(dirs, getReferencedIds);
  }
};
