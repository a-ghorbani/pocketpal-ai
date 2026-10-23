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
import {docId} from '../../../../jest/fixtures/documentIds';

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
    expect(ref.tokenEstimate).toBe(Math.ceil(ref.charCount / 3));
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

  it.each([
    ['application/pdf', 'pdf', 'source.pdf'],
    ['text/plain', 'text', 'source.txt'],
    ['text/markdown; charset=utf-8', 'text', 'source.txt'],
    ['application/json', 'text', 'source.txt'],
  ])(
    'classifies a name without an extension by its type %s',
    async (type, kind, fileName) => {
      pdfPages = ['only page'];
      const ref = ready(
        await importDocument(
          picked('Scan', kind === 'pdf' ? '%PDF' : 'hi', {type}),
        ),
      );
      expect(ref.kind).toBe(kind);
      expect(ref.name).toBe('Scan');
      expect(keepCopy.mock.calls[0][0].files[0].fileName).toBe(fileName);
    },
  );

  it.each([
    ['Statement 2024.03', 'application/pdf', 'pdf', 'source.pdf'],
    ['notes.v2', 'text/plain', 'text', 'source.txt'],
  ])(
    'classifies %s, whose suffix is not a document extension, by its type',
    async (name, type, kind, fileName) => {
      pdfPages = ['only page'];
      const ref = ready(
        await importDocument(
          picked(name, kind === 'pdf' ? '%PDF' : 'hi', {type}),
        ),
      );
      expect(ref.kind).toBe(kind);
      expect(ref.name).toBe(name);
      expect(keepCopy.mock.calls[0][0].files[0].fileName).toBe(fileName);
    },
  );

  it('refuses a name without an extension whose type is not a document', async () => {
    const result = await importDocument(
      picked('Photo', 'x', {type: 'image/heic'}),
    );
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
        fileName: 'source.pdf',
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
      expect(keepCopy.mock.calls[0][0].files[0].fileName).toBe('source.txt');
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

  it('keeps searchPinned and clears a stale mode on a range change', async () => {
    pdfPages = fortyPages();
    const ref = ready(await importDocument(picked('x.pdf', '%PDF')));

    const ranged = ready(
      await setDocumentPageRange(
        {...ref, searchPinned: true, mode: 'searched'},
        3,
        5,
      ),
    );

    expect(ranged.searchPinned).toBe(true);
    expect(ranged.mode).toBeUndefined();
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
    const gone: DocumentRef = {...all, id: docId('gone')};

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
    makeDir(docId('orphan'));
    makeDir(docId('kept'));
    await sweepOrphanDocuments(referenced(docId('kept')));
    expect(docDirs()).toEqual([`${ROOT}/${docId('kept')}`]);
  });

  it('never sweeps a held id (composer, send or import)', async () => {
    makeDir(docId('composer'));
    makeDir(docId('sending'));
    setComposerHeld([docId('composer')]);
    holdForSend([docId('sending')]);
    await sweepOrphanDocuments(referenced());
    expect(docDirs().sort()).toEqual(
      [`${ROOT}/${docId('composer')}`, `${ROOT}/${docId('sending')}`].sort(),
    );
    releaseSendHold([docId('sending')]);
  });

  it('keeps an import that starts while the sweep runs', async () => {
    makeDir(docId('old-orphan'));
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
    makeDir(docId('a'));
    makeDir(docId('b'));
    holdForSend([docId('b')]);
    let persisted = false;
    fs.unlink.mockImplementationOnce(async (p: string) => {
      [...dirs].filter(d => under(d, p)).forEach(d => dirs.delete(d));
      persisted = true;
      releaseSendHold([docId('b')]);
    });
    const getReferenced = jest.fn(async () =>
      persisted ? new Set([docId('b')]) : new Set<string>(),
    );

    await sweepOrphanDocuments(getReferenced);

    expect(docDirs()).toEqual([`${ROOT}/${docId('b')}`]);
    expect(getReferenced).toHaveBeenCalledTimes(2);
  });

  it('re-reads references until no hold was released during the read', async () => {
    makeDir(docId('a'));
    holdForSend([docId('other'), docId('a')]);
    let persisted = false;
    const getReferenced = jest
      .fn()
      .mockImplementationOnce(async () => {
        releaseSendHold([docId('other')]);
        return new Set<string>();
      })
      .mockImplementationOnce(async () => {
        persisted = true;
        releaseSendHold([docId('a')]);
        return new Set<string>();
      })
      .mockImplementation(async () =>
        persisted ? new Set([docId('a')]) : new Set<string>(),
      );

    await releaseDocuments([docId('a')], getReferenced);

    expect(docDirs()).toEqual([`${ROOT}/${docId('a')}`]);
  });

  it('release skips ids still referenced and deletes the rest', async () => {
    makeDir(docId('shared'));
    makeDir(docId('only-here'));
    await releaseDocuments(
      [docId('shared'), docId('only-here')],
      referenced(docId('shared')),
    );
    expect(docDirs()).toEqual([`${ROOT}/${docId('shared')}`]);
  });

  it('release skips held ids', async () => {
    makeDir(docId('editing'));
    setComposerHeld([docId('editing')]);
    await releaseDocuments([docId('editing')], referenced());
    expect(docDirs()).toEqual([`${ROOT}/${docId('editing')}`]);
  });
});

describe('invalid document ids', () => {
  const BAD_IDS = ['..', '../..', '../models', '/abs/path', '', 'a/b', 'a\\b'];
  const badRef = (id: string): DocumentRef => ({
    id,
    name: 'bad.pdf',
    kind: 'pdf',
    byteSize: 1,
    pageCount: 3,
    charCount: 1,
    tokenEstimate: 1,
  });

  it('release never unlinks outside documents/<uuid>', async () => {
    dirs.add(ROOT);
    await releaseDocuments(
      BAD_IDS,
      jest.fn(async () => new Set<string>()),
    );
    expect(fs.unlink).not.toHaveBeenCalled();
  });

  it('the sweep skips entries that are not uuid v4', async () => {
    dirs.add(ROOT);
    dirs.add(`${ROOT}/not-a-uuid`);
    await sweepOrphanDocuments(jest.fn(async () => new Set<string>()));
    expect(fs.unlink).not.toHaveBeenCalled();
  });

  it('a range change on an invalid ref resolves refused', async () => {
    for (const id of BAD_IDS) {
      await expect(setDocumentPageRange(badRef(id), 1, 2)).resolves.toEqual({
        status: 'refused',
        reason: 'pdf_unreadable',
      });
    }
    await expect(
      setDocumentPageRange(badRef(docId('good')), 1.5, 2),
    ).resolves.toEqual({status: 'refused', reason: 'pdf_unreadable'});
  });

  it('missing-file probe resolves for invalid ids', async () => {
    const refs = BAD_IDS.map(badRef);
    const missing = await findMissingDocuments(refs);
    expect(missing.size).toBe(new Set(refs.map(documentKey)).size);
  });

  it('reads an invalid id or range as missing', async () => {
    const texts = await loadDocumentTexts([
      badRef('../x'),
      {...badRef(docId('ranged')), pageRange: {from: 1.5, to: 2}},
    ]);
    expect([...texts.values()]).toEqual(['missing', 'missing']);
  });
});

describe('picker staging', () => {
  const stageAt = (dir: string) =>
    keepCopy.mockImplementationOnce(async ({files: toCopy}) => {
      dirs.add(dir);
      return toCopy.map((file: {uri: string; fileName: string}) => {
        const staged = `${dir}/${file.fileName}`;
        files.set(staged, files.get(file.uri) ?? '');
        return {
          status: 'success',
          sourceUri: file.uri,
          localUri: `file://${encodeURI(staged)}`,
        };
      });
    });

  it('stages under a fixed name, never the picked display name', async () => {
    pdfPages = ['text'];
    ready(await importDocument(picked('../../evil name.pdf', '%PDF')));
    expect(keepCopy.mock.calls[0][0].files[0].fileName).toBe('source.pdf');
  });

  it('skips staging cleanup outside the caches dir and still imports', async () => {
    pdfPages = ['text'];
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    stageAt('/somewhere/else/uuid');

    const ref = ready(await importDocument(picked('a.pdf', '%PDF')));

    expect(ref.kind).toBe('pdf');
    expect(fs.unlink).not.toHaveBeenCalledWith('/somewhere/else/uuid');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('cleans staging when only one side has the /private prefix', async () => {
    pdfPages = ['text'];
    const caches = (RNFS as any).CachesDirectoryPath;
    stageAt(`/private${caches}/uuid-a`);
    ready(await importDocument(picked('a.pdf', '%PDF')));
    expect(fs.unlink).toHaveBeenCalledWith(`/private${caches}/uuid-a`);

    Object.defineProperty(RNFS, 'CachesDirectoryPath', {
      value: `/private${caches}`,
      configurable: true,
    });
    stageAt(`${caches}/uuid-b`);
    ready(await importDocument(picked('b.pdf', '%PDF')));
    expect(fs.unlink).toHaveBeenCalledWith(`${caches}/uuid-b`);
    Object.defineProperty(RNFS, 'CachesDirectoryPath', {
      value: caches,
      configurable: true,
    });
  });
});

describe('release and cached search indexes', () => {
  it("release drops the id's cached indexes", async () => {
    const retrieveModule = jest.requireActual('../retrieve');
    const drop = jest.spyOn(retrieveModule, 'dropDocumentIndexes');
    const id = docId('dropped');
    dirs.add(ROOT);
    dirs.add(`${ROOT}/${id}`);

    await releaseDocuments(
      [id],
      jest.fn(async () => new Set<string>()),
    );

    expect(drop).toHaveBeenCalledWith(id);
    drop.mockRestore();
  });
});
