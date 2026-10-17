import * as RNFS from '@dr.pogodin/react-native-fs';
import {keepLocalCopy} from '@react-native-documents/picker';

import NativePdfText from '../../../specs/NativePdfText';
import {
  findMissingDocuments,
  holdForSend,
  importDocument,
  isHeld,
  loadDocumentTexts,
  releaseDocuments,
  releaseImportHold,
  releaseSendHold,
  setComposerHeld,
  setDocumentPageRange,
  sweepOrphanDocuments,
  type DocumentResult,
  type PickedDocument,
} from '../store';
import {documentKey} from '../render';
import type {DocumentRef} from '../types';

const ROOT = '/path/to/documents/documents';
const STAGING = '/path/to/caches/staging-uuid';

const files = new Map<string, string>();
const dirs = new Set<string>();
const fs = RNFS as unknown as Record<string, jest.Mock>;
const extractPages = NativePdfText.extractPages as jest.Mock;
const keepCopy = keepLocalCopy as jest.Mock;

const under = (path: string, dir: string) =>
  path === dir || path.startsWith(`${dir}/`);

let pdfPages: string[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  files.clear();
  dirs.clear();
  pdfPages = [];
  fs.exists.mockImplementation(
    async (p: string) => files.has(p) || dirs.has(p),
  );
  fs.mkdir.mockImplementation(async (p: string) => {
    dirs.add(p);
  });
  fs.writeFile.mockImplementation(async (p: string, c: string) => {
    files.set(p, c);
  });
  fs.readFile.mockImplementation(async (p: string) => {
    if (!files.has(p)) {
      throw new Error('ENOENT');
    }
    return files.get(p);
  });
  fs.read.mockImplementation(async (p: string, length: number) =>
    (files.get(p) ?? '').slice(0, length),
  );
  fs.moveFile.mockImplementation(async (from: string, to: string) => {
    files.set(to, files.get(from) ?? '');
    files.delete(from);
  });
  fs.stat.mockImplementation(async (p: string) => ({
    size: (files.get(p) ?? '').length,
  }));
  fs.unlink.mockImplementation(async (p: string) => {
    [...files.keys()].filter(k => under(k, p)).forEach(k => files.delete(k));
    [...dirs].filter(d => under(d, p)).forEach(d => dirs.delete(d));
  });
  fs.readDir.mockImplementation(async (p: string) =>
    [...dirs]
      .filter(d => d.slice(0, d.lastIndexOf('/')) === p)
      .map(d => ({
        name: d.slice(d.lastIndexOf('/') + 1),
        path: d,
        isDirectory: () => true,
      })),
  );
  keepCopy.mockImplementation(async ({files: toCopy}) => {
    dirs.add(STAGING);
    return toCopy.map((file: {uri: string; fileName: string}) => {
      const staged = `${STAGING}/${file.fileName}`;
      files.set(staged, files.get(file.uri) ?? '');
      return {
        status: 'success',
        sourceUri: file.uri,
        localUri: `file://${encodeURI(staged)}`,
      };
    });
  });
  extractPages.mockImplementation(
    async (_path: string, from: number, to: number) => ({
      pageCount: pdfPages.length,
      pages: to < from ? [] : pdfPages.slice(from - 1, to),
    }),
  );
});

afterEach(() => {
  setComposerHeld([]);
});

const picked = (
  name: string,
  content: string,
  extra: Partial<PickedDocument> = {},
): PickedDocument => {
  const uri = `content://picked/${name}`;
  files.set(uri, content);
  return {uri, name, size: content.length, ...extra};
};

const ready = (result: DocumentResult): DocumentRef => {
  if (result.status !== 'ready') {
    throw new Error(`expected ready, got ${JSON.stringify(result)}`);
  }
  releaseImportHold(result.ref.id);
  return result.ref;
};

const stagingLeft = () =>
  [...files.keys(), ...dirs].some(p => p.startsWith(STAGING));

const docDirs = () => [...dirs].filter(d => d.startsWith(`${ROOT}/`));

describe('importDocument', () => {
  it('imports a PDF: source copied, all-pages text written, counts set', async () => {
    pdfPages = ['first page', 'second page'];
    const ref = ready(await importDocument(picked('report.pdf', '%PDF')));

    expect(ref).toMatchObject({name: 'report.pdf', kind: 'pdf', pageCount: 2});
    expect(ref.pageRange).toBeUndefined();
    expect(ref.tokenEstimate).toBe(Math.ceil(ref.charCount / 4));
    expect(files.get(`${ROOT}/${ref.id}/source.pdf`)).toBe('%PDF');
    expect(JSON.parse(files.get(`${ROOT}/${ref.id}/text.all.json`)!)).toEqual({
      version: 1,
      firstPage: 1,
      pages: pdfPages,
    });
    expect(stagingLeft()).toBe(false);
    expect(isHeld(ref.id)).toBe(false);
  });

  it('keeps the import hold on success until the caller releases it', async () => {
    pdfPages = ['text'];
    const result = await importDocument(picked('a.pdf', '%PDF'));
    expect(result.status).toBe('ready');
    const id = (result as {ref: DocumentRef}).ref.id;
    expect(isHeld(id)).toBe(true);
    releaseImportHold(id);
    expect(isHeld(id)).toBe(false);
  });

  it('imports a text file', async () => {
    const ref = ready(
      await importDocument(picked('notes.md', '# Notes\nbody')),
    );
    expect(ref.kind).toBe('text');
    expect(ref.pageCount).toBeUndefined();
    expect(
      JSON.parse(files.get(`${ROOT}/${ref.id}/text.all.json`)!).pages,
    ).toEqual(['# Notes\nbody']);
  });

  it('refuses a scanned PDF with no text and deletes its directory', async () => {
    pdfPages = ['', '  '];
    const result = await importDocument(picked('scan.pdf', '%PDF'));
    expect(result).toEqual({status: 'refused', reason: 'no_text'});
    expect(docDirs()).toEqual([]);
    expect(stagingLeft()).toBe(false);
  });

  it.each([
    ['E_PDF_ENCRYPTED', 'pdf_encrypted'],
    ['E_PDF_UNREADABLE', 'pdf_unreadable'],
  ])('maps native %s to %s', async (code, reason) => {
    extractPages.mockRejectedValueOnce(Object.assign(new Error(code), {code}));
    const result = await importDocument(picked('locked.pdf', '%PDF'));
    expect(result).toEqual({status: 'refused', reason});
    expect(docDirs()).toEqual([]);
  });

  it('refuses an unsupported extension without copying', async () => {
    const result = await importDocument(picked('photo.heic', 'x'));
    expect(result).toEqual({status: 'refused', reason: 'unsupported_type'});
    expect(keepCopy).not.toHaveBeenCalled();
  });

  it('refuses a file over 25 MB', async () => {
    const result = await importDocument(
      picked('big.pdf', 'x', {size: 26 * 1024 * 1024}),
    );
    expect(result).toEqual({status: 'refused', reason: 'too_large'});
  });

  it('refuses a binary text file', async () => {
    const result = await importDocument(picked('data.csv', 'a,b\u0000c'));
    expect(result).toEqual({status: 'refused', reason: 'binary'});
    expect(docDirs()).toEqual([]);
  });

  it('refuses a text file over the byte cap without decoding it', async () => {
    const result = await importDocument(
      picked('huge.txt', 'x'.repeat(3_000_001)),
    );
    expect(result).toEqual({status: 'refused', reason: 'text_too_long'});
    expect(fs.readFile).not.toHaveBeenCalled();
  });

  it('refuses a text file whose block exceeds the char limit', async () => {
    const result = await importDocument(
      picked('long.txt', 'y'.repeat(1_000_001)),
    );
    expect(result).toEqual({status: 'refused', reason: 'text_too_long'});
  });

  it('refuses when the copy fails and leaves no staging dir', async () => {
    keepCopy.mockResolvedValueOnce([
      {status: 'error', sourceUri: 'x', copyError: 'denied'},
    ]);
    const result = await importDocument(picked('a.pdf', '%PDF'));
    expect(result).toEqual({status: 'refused', reason: 'copy_failed'});
    expect(docDirs()).toEqual([]);
  });

  it('removes the staging dir when the move fails', async () => {
    fs.moveFile.mockRejectedValueOnce(new Error('EXDEV'));
    const result = await importDocument(picked('a.pdf', '%PDF'));
    expect(result).toEqual({status: 'refused', reason: 'copy_failed'});
    expect(stagingLeft()).toBe(false);
    expect(docDirs()).toEqual([]);
  });

  describe('Android virtual files', () => {
    it('converts to PDF when offered', async () => {
      pdfPages = ['doc text'];
      const ref = ready(
        await importDocument(
          picked('Quarterly plan', 'x', {
            isVirtual: true,
            convertibleToMimeTypes: [
              {mimeType: 'text/plain'},
              {mimeType: 'application/pdf'},
            ],
          }),
        ),
      );
      expect(ref.kind).toBe('pdf');
      expect(keepCopy.mock.calls[0][0].files[0]).toMatchObject({
        fileName: 'Quarterly plan.pdf',
        convertVirtualFileToType: 'application/pdf',
      });
    });

    it('converts to plain text when PDF is not offered', async () => {
      const ref = ready(
        await importDocument(
          picked('Sheet', 'cells', {
            isVirtual: true,
            convertibleToMimeTypes: [{mimeType: 'text/plain'}],
          }),
        ),
      );
      expect(ref.kind).toBe('text');
      expect(keepCopy.mock.calls[0][0].files[0].fileName).toBe('Sheet.txt');
    });

    it('refuses when neither is offered', async () => {
      const result = await importDocument(
        picked('Drawing', 'x', {
          isVirtual: true,
          convertibleToMimeTypes: [{mimeType: 'image/png'}],
        }),
      );
      expect(result).toEqual({status: 'refused', reason: 'unsupported_type'});
    });
  });

  it('sends a PDF over 500 pages to needs_range without reading its text', async () => {
    pdfPages = Array.from({length: 1200}, (_, i) => `p${i + 1}`);
    const result = await importDocument(picked('big.pdf', '%PDF'));
    expect(result).toMatchObject({
      status: 'needs_range',
      rangeLimit: 'too_many_pages',
      ref: {pageCount: 1200},
    });
    expect(extractPages).toHaveBeenCalledTimes(1);
    expect(extractPages).toHaveBeenCalledWith(expect.any(String), 1, 0);
    const id = (result as {ref: DocumentRef}).ref.id;
    expect(isHeld(id)).toBe(true);
    expect(files.has(`${ROOT}/${id}/text.all.json`)).toBe(false);
    releaseImportHold(id);
  });

  it('counts exactly with a local context', async () => {
    pdfPages = ['x'];
    const ref = ready(
      await importDocument(picked('a.pdf', '%PDF'), {
        modelId: 'local-1',
        tokenize: async () => 42,
      }),
    );
    expect(ref.tokenCount).toEqual({modelId: 'local-1', n: 42});
  });

  it('keeps the estimate when tokenize throws', async () => {
    pdfPages = ['x'];
    const ref = ready(
      await importDocument(picked('a.pdf', '%PDF'), {
        modelId: 'local-1',
        tokenize: async () => {
          throw new Error('context released');
        },
      }),
    );
    expect(ref.tokenCount).toBeUndefined();
    expect(ref.tokenEstimate).toBeGreaterThan(0);
  });
});

describe('setDocumentPageRange', () => {
  const fortyPages = () => Array.from({length: 40}, (_, i) => `page ${i + 1}`);

  it('writes a range file beside the all-pages file and leaves it untouched', async () => {
    pdfPages = fortyPages();
    const ref = ready(await importDocument(picked('x.pdf', '%PDF')));
    const allFile = `${ROOT}/${ref.id}/text.all.json`;
    const before = files.get(allFile);

    const ranged = ready(await setDocumentPageRange(ref, 3, 5));

    expect(ranged.id).toBe(ref.id);
    expect(ranged.pageRange).toEqual({from: 3, to: 5});
    expect(ranged.charCount).toBeLessThan(ref.charCount);
    expect(files.get(allFile)).toBe(before);
    expect(JSON.parse(files.get(`${ROOT}/${ref.id}/text.3-5.json`)!)).toEqual({
      version: 1,
      firstPage: 3,
      pages: ['page 3', 'page 4', 'page 5'],
    });
    expect(ref.pageRange).toBeUndefined();
  });

  it('reuses an existing range file and never rewrites it', async () => {
    pdfPages = fortyPages();
    const ref = ready(await importDocument(picked('x.pdf', '%PDF')));
    await setDocumentPageRange(ref, 3, 5);
    extractPages.mockClear();
    fs.writeFile.mockClear();

    const again = ready(await setDocumentPageRange(ref, 3, 5));

    expect(again.pageRange).toEqual({from: 3, to: 5});
    expect(extractPages).not.toHaveBeenCalled();
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('returns needs_range for a range over 500 pages', async () => {
    pdfPages = Array.from({length: 1200}, () => 'p');
    const result = await importDocument(picked('big.pdf', '%PDF'));
    const ref = (result as {ref: DocumentRef}).ref;
    releaseImportHold(ref.id);

    expect(await setDocumentPageRange(ref, 1, 600)).toMatchObject({
      status: 'needs_range',
      rangeLimit: 'too_many_pages',
    });
    const ranged = ready(await setDocumentPageRange(ref, 10, 20));
    expect(ranged).toMatchObject({
      pageCount: 1200,
      pageRange: {from: 10, to: 20},
    });
  });
});

describe('loadDocumentTexts / findMissingDocuments', () => {
  it('loads each range of one id separately and reports missing files', async () => {
    pdfPages = ['a', 'b', 'c', 'd', 'e'];
    const all = ready(await importDocument(picked('x.pdf', '%PDF')));
    const narrowed = ready(await setDocumentPageRange(all, 3, 5));
    const gone: DocumentRef = {...all, id: 'gone-id'};

    const texts = await loadDocumentTexts([all, narrowed, gone]);

    expect(texts.get(documentKey(all))).toEqual(pdfPages);
    expect(texts.get(documentKey(narrowed))).toEqual(['c', 'd', 'e']);
    expect(texts.get(documentKey(gone))).toBe('missing');
    expect(await findMissingDocuments([all, gone])).toEqual(
      new Set([documentKey(gone)]),
    );
  });
});

describe('release and sweep', () => {
  const makeDir = (id: string) => {
    dirs.add(ROOT);
    dirs.add(`${ROOT}/${id}`);
    files.set(`${ROOT}/${id}/text.all.json`, '{}');
  };
  const referenced = (...ids: string[]) => jest.fn(async () => new Set(ids));

  it('sweeps an unreferenced, unheld directory', async () => {
    makeDir('orphan');
    makeDir('kept');
    await sweepOrphanDocuments(referenced('kept'));
    expect(docDirs()).toEqual([`${ROOT}/kept`]);
  });

  it('never sweeps a held id (composer, send or import)', async () => {
    makeDir('composer');
    makeDir('sending');
    setComposerHeld(['composer']);
    holdForSend(['sending']);
    await sweepOrphanDocuments(referenced());
    expect(docDirs().sort()).toEqual([`${ROOT}/composer`, `${ROOT}/sending`]);
    releaseSendHold(['sending']);
  });

  it('keeps an import that starts while the sweep runs', async () => {
    makeDir('old-orphan');
    pdfPages = ['text'];
    let imported: DocumentResult | undefined;
    const getReferenced = jest.fn(async () => {
      imported = await importDocument(picked('a.pdf', '%PDF'));
      return new Set<string>();
    });

    await sweepOrphanDocuments(getReferenced);

    const ref = ready(imported!);
    expect(docDirs()).toEqual([`${ROOT}/${ref.id}`]);
  });

  it('re-reads references when a hold is released mid-sweep', async () => {
    makeDir('a');
    makeDir('b');
    holdForSend(['b']);
    let persisted = false;
    fs.unlink.mockImplementationOnce(async (p: string) => {
      [...dirs].filter(d => under(d, p)).forEach(d => dirs.delete(d));
      persisted = true;
      releaseSendHold(['b']);
    });
    const getReferenced = jest.fn(async () =>
      persisted ? new Set(['b']) : new Set<string>(),
    );

    await sweepOrphanDocuments(getReferenced);

    expect(docDirs()).toEqual([`${ROOT}/b`]);
    expect(getReferenced).toHaveBeenCalledTimes(2);
  });

  it('release skips ids still referenced and deletes the rest', async () => {
    makeDir('shared');
    makeDir('only-here');
    await releaseDocuments(['shared', 'only-here'], referenced('shared'));
    expect(docDirs()).toEqual([`${ROOT}/shared`]);
  });

  it('release skips held ids', async () => {
    makeDir('editing');
    setComposerHeld(['editing']);
    await releaseDocuments(['editing'], referenced());
    expect(docDirs()).toEqual([`${ROOT}/editing`]);
  });
});
