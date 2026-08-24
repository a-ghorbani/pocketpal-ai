/**
 * Text extraction for binary document formats, so attachments and the
 * knowledge base can ingest PDFs and OOXML/EPUB packages instead of
 * only plain-text files.
 *
 * Two paths:
 *  - PDF: the native PdfTextModule (pdfbox-android) returns the text
 *    layer; scanned/image-only PDFs come back empty and are treated as
 *    not extractable.
 *  - OOXML / EPUB / ODT: these are zip containers of XML. The whole
 *    file is read into memory, inflated with fflate (pure JS), and the
 *    relevant XML parts are converted to plain text here. No native
 *    code involved.
 *
 * Format dispatch is by magic bytes (with an extension fallback), so a
 * renamed file still routes correctly.
 */
import {NativeModules} from 'react-native';
import {strFromU8, unzipSync} from 'fflate';
import * as RNFS from '@dr.pogodin/react-native-fs';

/** Zip-based documents above this size are skipped (RAM guard). */
export const MAX_ZIP_BYTES = 10 * 1024 * 1024;
/** PDFs above this size are skipped. */
export const MAX_PDF_BYTES = 25 * 1024 * 1024;
/** Extraction output cap; the chat path applies its own smaller caps. */
export const MAX_EXTRACT_CHARS = 400_000;

export const EXTRACTABLE_EXTENSIONS = new Set([
  'pdf',
  'docx',
  'epub',
  'odt',
  'pptx',
  'xlsx',
]);

const EXTRACTABLE_MIME_PREFIX = 'application/vnd.openxmlformats-officedocument';
const EXTRACTABLE_MIMES = new Set([
  'application/pdf',
  'application/epub+zip',
  'application/vnd.oasis.opendocument.text',
]);

export const isExtractableFile = (name: string, mime?: string): boolean => {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (EXTRACTABLE_EXTENSIONS.has(ext)) {
    return true;
  }
  if (mime) {
    const normalized = mime.toLowerCase().split(';')[0].trim();
    if (normalized.startsWith(EXTRACTABLE_MIME_PREFIX)) {
      return true;
    }
    return EXTRACTABLE_MIMES.has(normalized);
  }
  return false;
};

export const extractCapFor = (name: string): number =>
  (name.toLowerCase().split('.').pop() ?? '') === 'pdf'
    ? MAX_PDF_BYTES
    : MAX_ZIP_BYTES;

// --- base64 helpers (RNFS.read returns base64 for binary ranges) ---

const B64_REV: Record<string, number> = {};
const B64_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
for (let i = 0; i < B64_CHARS.length; i++) {
  B64_REV[B64_CHARS[i]] = i;
}

export const b64ToBytes = (b64: string): Uint8Array => {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const len = clean.length;
  const out = new Uint8Array(Math.floor((len * 3) / 4));
  let o = 0;
  for (let i = 0; i < len; i += 4) {
    const a = B64_REV[clean[i]];
    const b = B64_REV[clean[i + 1]];
    const c = B64_REV[clean[i + 2]];
    const d = B64_REV[clean[i + 3]];
    if (a === undefined || b === undefined || i + 1 >= len) {
      throw new Error('bad base64 input');
    }
    const trip = (a << 18) | (b << 12) | ((c ?? 0) << 6) | (d ?? 0);
    out[o++] = (trip >> 16) & 0xff;
    if (clean[i + 2] !== '=') {
      out[o++] = (trip >> 8) & 0xff;
    }
    if (clean[i + 3] !== '=') {
      out[o++] = trip & 0xff;
    }
  }
  return out.subarray(0, o);
};

// --- format sniffing ---

export const sniffFormat = (bytes: Uint8Array): 'pdf' | 'zip' | null => {
  // Some PDFs carry junk before the header; search a window.
  const head = strFromU8(bytes.subarray(0, 1024));
  if (head.includes('%PDF-')) {
    return 'pdf';
  }
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    return 'zip'; // PK...: local header, empty, or spanned marker
  }
  return null;
};

// --- XML/HTML to text (pure, unit-tested) ---

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&nbsp;': ' ',
};

export const decodeEntities = (s: string): string =>
  s.replace(/&(amp|lt|gt|quot|apos|nbsp|#x?[0-9a-fA-F]+);/g, (m, e) => {
    if (ENTITIES[m]) {
      return ENTITIES[m];
    }
    const num =
      e[1] === 'x' || e[1] === 'X'
        ? parseInt(e.slice(2), 16)
        : parseInt(e.slice(1), 10);
    return Number.isFinite(num) ? String.fromCodePoint(num) : m;
  });

/** WordprocessingML (docx body) to text: paragraphs -> newlines. */
export const docxXmlToText = (xml: string): string => {
  const paragraphs = xml.split(/<\/w:p>/);
  const lines: string[] = [];
  for (const p of paragraphs) {
    // Tabs/breaks live between text runs; convert them to synthetic runs
    // so they survive the run extraction below.
    const prepared = p
      .replace(/<w:tab\b[^>]*\/?>/g, '<w:t xml:space="preserve">\t</w:t>')
      .replace(/<w:br\b[^>]*\/?>/g, '<w:t xml:space="preserve">\n</w:t>');
    const runs = prepared.match(/<w:t[^>]*>[\s\S]*?<\/w:t>/g) ?? [];
    const line = runs.map(r => r.replace(/<[^>]+>/g, '')).join('');
    lines.push(decodeEntities(line));
  }
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

/** DrawingML (pptx slides) to text: paragraph runs -> lines. */
export const pptxXmlToText = (xml: string): string => {
  const paragraphs = xml.split(/<\/a:p>/);
  const lines: string[] = [];
  for (const p of paragraphs) {
    const runs = p.match(/<a:t[^>]*>[\s\S]*?<\/a:t>/g) ?? [];
    const line = runs
      .map(r => decodeEntities(r.replace(/<[^>]+>/g, '')))
      .join('');
    if (line.trim()) {
      lines.push(line);
    }
  }
  return lines.join('\n');
};

/** ODF content.xml to text: text:h / text:p -> lines. */
export const odfXmlToText = (xml: string): string => {
  const lines = xml
    .replace(/<\/text:(?:h|p)>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .split('\n')
    .map(l => decodeEntities(l).trim());
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

/** XHTML to plain text for EPUB chapters. */
export const htmlToText = (html: string): string => {
  const text = html
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\b[^>]*>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote|section)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\r\n/g, '\n');
  return decodeEntities(text)
    .split('\n')
    .map(l => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

// --- zip package readers (take an fflate files map; unit-testable) ---

type ZipFiles = Record<string, Uint8Array>;

const zipStr = (files: ZipFiles, name: string): string | null => {
  const bytes = files[name];
  return bytes ? strFromU8(bytes) : null;
};

const dirname = (path: string): string => {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i + 1);
};

const resolveZipPath = (base: string, href: string): string => {
  if (href.startsWith('/')) {
    return href.slice(1);
  }
  const stack = base.split('/').filter(s => s !== '');
  for (const part of href.split('/')) {
    if (part === '..') {
      stack.pop();
    } else if (part !== '.' && part !== '') {
      stack.push(part);
    }
  }
  return stack.join('/');
};

/** EPUB: container.xml -> OPF -> spine order -> chapter XHTML text. */
export const epubFilesToText = (files: ZipFiles): string => {
  const container = zipStr(files, 'META-INF/container.xml');
  const opfPath = container?.match(/full-path="([^"]+)"/)?.[1];
  if (!opfPath) {
    return '';
  }
  const opf = zipStr(files, opfPath);
  if (!opf) {
    return '';
  }
  const base = dirname(opfPath);
  const manifest = new Map<string, string>();
  for (const m of opf.matchAll(/<item\b[^>]*>/g)) {
    const id = m[0].match(/id="([^"]+)"/)?.[1];
    const href = m[0].match(/href="([^"]+)"/)?.[1];
    if (id && href) {
      manifest.set(id, resolveZipPath(base, href));
    }
  }
  const chapters: string[] = [];
  for (const m of opf.matchAll(/<itemref\b[^>]*>/g)) {
    const idref = m[0].match(/idref="([^"]+)"/)?.[1];
    const path = idref ? manifest.get(idref) : undefined;
    if (!path) {
      continue;
    }
    const html = zipStr(files, path);
    if (html) {
      chapters.push(htmlToText(html));
    }
  }
  return chapters.filter(c => c.length > 0).join('\n\n');
};

/** XLSX: shared strings + sheet cell values -> TSV-ish text. */
export const xlsxFilesToText = (files: ZipFiles): string => {
  const shared: string[] = [];
  const sharedXml = zipStr(files, 'xl/sharedStrings.xml');
  if (sharedXml) {
    for (const si of sharedXml.matchAll(/<si>[\s\S]*?<\/si>/g)) {
      const runs = si[0].match(/<t[^>]*>[\s\S]*?<\/t>/g) ?? [];
      shared.push(
        decodeEntities(runs.map(r => r.replace(/<[^>]+>/g, '')).join('')),
      );
    }
  }
  const sheetNames = Object.keys(files)
    .filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => {
      const na = parseInt(a.match(/(\d+)/)![1], 10);
      const nb = parseInt(b.match(/(\d+)/)![1], 10);
      return na - nb;
    });
  const out: string[] = [];
  sheetNames.forEach((sheetPath, idx) => {
    const xml = zipStr(files, sheetPath);
    if (!xml) {
      return;
    }
    out.push(`[Sheet ${idx + 1}]`);
    for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: string[] = [];
      for (const cell of row[1].matchAll(/<c\b[^>]*>([\s\S]*?)<\/c>/g)) {
        const attrs = cell[0].match(/<c\b[^>]*>/)![0];
        const type = attrs.match(/t="([^"]+)"/)?.[1];
        let value = '';
        if (type === 's') {
          const v = cell[1].match(/<v>([\s\S]*?)<\/v>/)?.[1];
          value = v ? (shared[parseInt(v, 10)] ?? '') : '';
        } else if (type === 'inlineStr') {
          const runs = cell[1].match(/<t[^>]*>[\s\S]*?<\/t>/g) ?? [];
          value = decodeEntities(
            runs.map(r => r.replace(/<[^>]+>/g, '')).join(''),
          );
        } else {
          value = cell[1].match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '';
        }
        cells.push(decodeEntities(value));
      }
      if (cells.length > 0) {
        out.push(cells.join('\t'));
      }
    }
  });
  return out.join('\n');
};

/** Number-aware slide ordering: slide2 before slide10. */
export const slideOrder = (names: string[]): string[] =>
  names
    .map(n => {
      const m = n.match(/^ppt\/slides\/slide(\d+)\.xml$/);
      return m ? {n, i: parseInt(m[1], 10)} : null;
    })
    .filter((x): x is {n: string; i: number} => x !== null)
    .sort((a, b) => a.i - b.i)
    .map(x => x.n);

/** Route an already-inflated zip package to its format reader. */
export const zipFilesToText = (files: ZipFiles, ext: string): string => {
  switch (ext) {
    case 'docx':
      return docxXmlToText(zipStr(files, 'word/document.xml') ?? '');
    case 'odt':
      return odfXmlToText(zipStr(files, 'content.xml') ?? '');
    case 'epub':
      return epubFilesToText(files);
    case 'xlsx':
      return xlsxFilesToText(files);
    case 'pptx': {
      const slides = slideOrder(Object.keys(files));
      return slides
        .map(n => pptxXmlToText(zipStr(files, n) ?? ''))
        .filter(t => t.length > 0)
        .join('\n\n');
    }
    default:
      return '';
  }
};

// --- top-level entry ---

const extractPdfText = async (path: string): Promise<string | null> => {
  const mod = NativeModules.PdfTextExtractor as
    | {extractText?: (p: string) => Promise<string>}
    | undefined;
  if (!mod?.extractText) {
    return null; // native module absent (iOS/tests); not extractable
  }
  const text = await mod.extractText(path);
  return text && text.trim().length > 0 ? text : null;
};

/**
 * Extract document text from a staged file. Returns null for formats
 * without an extractor, scanned PDFs, corrupt packages, or oversize
 * inputs. Never throws for expected failure modes.
 */
export const extractDocumentText = async (
  localPath: string,
  name: string,
): Promise<string | null> => {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  try {
    // Read enough of the head to sniff the format.
    const headB64 = await RNFS.read(localPath, 512, 0, 'base64');
    const head = b64ToBytes(headB64);
    const format = sniffFormat(head);
    if (format === 'pdf' || (format === null && ext === 'pdf')) {
      return await extractPdfText(localPath);
    }
    if (format === 'zip') {
      const fullB64 = await RNFS.read(localPath, 0, 0, 'base64');
      const files = unzipSync(b64ToBytes(fullB64));
      let text = zipFilesToText(files, ext);
      if (text.length > MAX_EXTRACT_CHARS) {
        text = `${text.slice(0, MAX_EXTRACT_CHARS)}\n\n[truncated]`;
      }
      return text.trim().length > 0 ? text : null;
    }
    return null;
  } catch (error) {
    console.warn(
      `[extract] ${name} failed:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
};
