import * as RNFS from '@dr.pogodin/react-native-fs';
import {pick} from '@react-native-documents/picker';

import {MessageType} from '../types';

import {
  PER_FILE_CHAR_CAP,
  TOTAL_CHAR_CAP,
  MAX_READABLE_BYTES,
  AttachmentRecord,
  PendingAttachment,
  buildAttachmentRecords,
  formatAttachmentsForPrompt,
  formatByteSize,
  getMessageAttachments,
  hasMessageAttachments,
  isPendingAttachment,
  isTextSafeFile,
  pickFileAttachments,
  toAttachmentRecord,
} from '../fileAttachments';

const pending = (over: Partial<PendingAttachment> = {}): PendingAttachment => ({
  name: 'notes.md',
  size: 100,
  mime: 'text/markdown',
  localPath: '/cache/attachments/1_notes.md',
  ...over,
});

const record = (over: Partial<AttachmentRecord> = {}): AttachmentRecord => ({
  name: 'notes.md',
  size: 100,
  mime: 'text/markdown',
  content: 'captured',
  ...over,
});

const textMessage = (metadata?: any): MessageType.Text => ({
  id: 'm1',
  author: {id: 'u'} as any,
  createdAt: Date.now(),
  text: 'hi',
  type: 'text',
  ...(metadata ? {metadata} : {}),
});

describe('isTextSafeFile', () => {
  it('accepts text/* MIME types', () => {
    expect(isTextSafeFile('file.bin', 'text/plain')).toBe(true);
    expect(isTextSafeFile('file.bin', 'TEXT/PLAIN; charset=utf-8')).toBe(true);
    expect(isTextSafeFile('file', 'text/csv')).toBe(true);
  });

  it('accepts known non-text MIME types', () => {
    expect(isTextSafeFile('file', 'application/json')).toBe(true);
    expect(isTextSafeFile('file.svg', 'image/svg+xml')).toBe(true);
    expect(isTextSafeFile('file', 'application/x-yaml')).toBe(true);
  });

  it('accepts known extensions when MIME is absent', () => {
    expect(isTextSafeFile('script.py')).toBe(true);
    expect(isTextSafeFile('config.toml')).toBe(true);
    expect(isTextSafeFile('Dockerfile.dockerfile')).toBe(true);
  });

  it('matches extensions case-insensitively', () => {
    expect(isTextSafeFile('README.MD')).toBe(true);
    expect(isTextSafeFile('app.TSX')).toBe(true);
  });

  it('rejects unknown extensions and binary MIME types', () => {
    expect(isTextSafeFile('photo.jpg', 'image/jpeg')).toBe(false);
    expect(isTextSafeFile('archive.zip', 'application/zip')).toBe(false);
    expect(isTextSafeFile('mystery.xyz')).toBe(false);
    expect(isTextSafeFile('noext', 'application/octet-stream')).toBe(false);
  });
});

describe('formatByteSize', () => {
  it('formats bytes', () => {
    expect(formatByteSize(500)).toBe('500 B');
  });
  it('formats kilobytes', () => {
    expect(formatByteSize(2048)).toBe('2.0 KB');
  });
  it('formats megabytes', () => {
    expect(formatByteSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });
  it('formats gigabytes', () => {
    expect(formatByteSize(3 * 1024 * 1024 * 1024)).toBe('3.0 GB');
  });
});

describe('isPendingAttachment / toAttachmentRecord', () => {
  it('identifies pending attachments by localPath', () => {
    expect(isPendingAttachment(pending())).toBe(true);
    expect(isPendingAttachment(record())).toBe(false);
  });

  it('validates persisted records', () => {
    const rec = record();
    expect(toAttachmentRecord(rec)).toBe(rec);
    expect(toAttachmentRecord(pending())).toBeNull();
    expect(toAttachmentRecord({size: 5} as any)).toBeNull();
    expect(toAttachmentRecord({name: 'a'} as any)).toBeNull();
    expect(toAttachmentRecord(null as any)).toBeNull();
  });
});

describe('buildAttachmentRecords', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (RNFS.readFile as jest.Mock).mockResolvedValue('file body');
  });

  it('captures readable text files', async () => {
    const out = await buildAttachmentRecords([
      pending({name: 'a.md', mime: 'text/markdown', size: 9}),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      name: 'a.md',
      size: 9,
      mime: 'text/markdown',
      content: 'file body',
    });
    expect(RNFS.readFile).toHaveBeenCalledWith(
      '/cache/attachments/1_notes.md',
      'utf8',
    );
  });

  it('normalizes CRLF line endings', async () => {
    (RNFS.readFile as jest.Mock).mockResolvedValue('a\r\nb\r\nc');
    const out = await buildAttachmentRecords([pending()]);
    expect(out[0].content).toBe('a\nb\nc');
  });

  it('truncates a file at the per-file cap', async () => {
    (RNFS.readFile as jest.Mock).mockResolvedValue(
      'x'.repeat(PER_FILE_CHAR_CAP + 50),
    );
    const out = await buildAttachmentRecords([
      pending({size: PER_FILE_CHAR_CAP + 50}),
    ]);
    expect(out[0].content).toHaveLength(PER_FILE_CHAR_CAP);
    expect(out[0].truncated).toBe(true);
  });

  it('enforces the total budget across files', async () => {
    const big = 'y'.repeat(PER_FILE_CHAR_CAP + 10);
    (RNFS.readFile as jest.Mock).mockResolvedValue(big);
    const out = await buildAttachmentRecords([
      pending({name: 'f1', localPath: '/c/f1'}),
      pending({name: 'f2', localPath: '/c/f2'}),
    ]);
    // First file hit the per-file cap, leaving exactly the cap of budget.
    expect(out[0].content).toHaveLength(PER_FILE_CHAR_CAP);
    expect(out[0].truncated).toBe(true);
    // Second file fits in the remaining budget after its own cap.
    expect(out[1].content).toHaveLength(PER_FILE_CHAR_CAP);
    expect(out[1].truncated).toBe(true);
  });

  it('yields empty content once the budget is exhausted', async () => {
    (RNFS.readFile as jest.Mock).mockResolvedValue(
      'z'.repeat(PER_FILE_CHAR_CAP),
    );
    const out = await buildAttachmentRecords([
      pending({name: 'f1', localPath: '/c/f1'}),
      pending({name: 'f2', localPath: '/c/f2'}),
      pending({name: 'f3', localPath: '/c/f3', size: 10}),
    ]);
    const total = out.reduce((n, r) => n + (r.content?.length ?? 0), 0);
    expect(total).toBeLessThanOrEqual(TOTAL_CHAR_CAP);
    expect(out[2].content).toBe('');
    expect(out[2].truncated).toBe(true);
  });

  it('refuses to read NUL-byte payloads disguised as text', async () => {
    (RNFS.readFile as jest.Mock).mockResolvedValue('ab\u0000cd');
    const out = await buildAttachmentRecords([pending()]);
    expect(out[0].content).toBeNull();
  });

  it('lists binary files without reading them', async () => {
    const out = await buildAttachmentRecords([
      pending({name: 'p.png', mime: 'image/png', size: 4000}),
    ]);
    expect(out[0].content).toBeNull();
    expect(RNFS.readFile).not.toHaveBeenCalled();
  });

  it('lists oversized text files without reading them', async () => {
    const out = await buildAttachmentRecords([
      pending({name: 'huge.log', size: MAX_READABLE_BYTES + 1}),
    ]);
    expect(out[0].content).toBeNull();
    expect(RNFS.readFile).not.toHaveBeenCalled();
  });

  it('lists zero-byte files without reading them', async () => {
    const out = await buildAttachmentRecords([pending({size: 0})]);
    expect(out[0].content).toBeNull();
    expect(RNFS.readFile).not.toHaveBeenCalled();
  });

  it('lists files that fail to read', async () => {
    (RNFS.readFile as jest.Mock).mockRejectedValue(new Error('io'));
    const out = await buildAttachmentRecords([pending()]);
    expect(out[0]).toEqual({
      name: 'notes.md',
      size: 100,
      mime: 'text/markdown',
      content: null,
    });
  });

  it('passes already-captured records through unchanged', async () => {
    const rec = record({name: 'prev.md', content: 'already captured'});
    const out = await buildAttachmentRecords([rec, pending({name: 'new.md'})]);
    expect(out[0]).toBe(rec);
    expect(out[1].name).toBe('new.md');
    expect(out[1].content).toBe('file body');
  });
});

describe('pickFileAttachments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (RNFS.stat as jest.Mock).mockResolvedValue({size: 7});
  });

  it('stages picked files into the cache dir', async () => {
    (pick as jest.Mock).mockResolvedValueOnce([
      {uri: 'content://1', name: 'a.md', type: 'text/markdown', size: 3},
      {uri: 'content://2', name: 'b.json', type: 'application/json', size: 4},
    ]);
    const staged = await pickFileAttachments();
    expect(staged).toHaveLength(2);
    expect(staged[0]).toMatchObject({
      name: 'a.md',
      size: 3,
      mime: 'text/markdown',
    });
    expect(staged[0].localPath).toContain('/attachments/');
    expect(RNFS.copyFile).toHaveBeenCalledWith(
      'content://1',
      expect.stringContaining('a.md'),
    );
    expect(RNFS.mkdir).toHaveBeenCalled();
  });

  it('falls back to stat size when the picker reports none', async () => {
    (pick as jest.Mock).mockResolvedValueOnce([
      {uri: 'content://1', name: 'a.md', type: 'text/markdown'},
    ]);
    const staged = await pickFileAttachments();
    expect(staged[0].size).toBe(7);
  });

  it('skips documents without a URI', async () => {
    (pick as jest.Mock).mockResolvedValueOnce([
      {name: 'ghost.md', type: 'text/markdown', size: 1},
      {uri: 'content://2', name: 'real.md', type: 'text/markdown', size: 2},
    ]);
    const staged = await pickFileAttachments();
    expect(staged).toHaveLength(1);
    expect(staged[0].name).toBe('real.md');
  });

  it('returns an empty list when the user cancels', async () => {
    (pick as jest.Mock).mockResolvedValueOnce([]);
    expect(await pickFileAttachments()).toEqual([]);
  });

  it('propagates picker errors', async () => {
    (pick as jest.Mock).mockRejectedValueOnce(new Error('picker died'));
    await expect(pickFileAttachments()).rejects.toThrow('picker died');
  });
});

describe('getMessageAttachments / hasMessageAttachments', () => {
  it('returns empty for messages without metadata', () => {
    expect(getMessageAttachments(textMessage())).toEqual([]);
    expect(hasMessageAttachments(textMessage())).toBe(false);
  });

  it('returns empty for non-array metadata', () => {
    expect(getMessageAttachments(textMessage({attachments: 'nope'}))).toEqual(
      [],
    );
  });

  it('filters malformed entries', () => {
    const msg = textMessage({
      attachments: [
        record({name: 'ok.md', size: 5, content: 'x'}),
        {name: 42, size: 5},
        {name: 'nosize'},
        null,
      ],
    });
    expect(getMessageAttachments(msg)).toEqual([
      {name: 'ok.md', size: 5, mime: 'text/markdown', content: 'x'},
    ]);
    expect(hasMessageAttachments(msg)).toBe(true);
  });
});

describe('formatAttachmentsForPrompt', () => {
  it('returns the text untouched when there are no records', () => {
    expect(formatAttachmentsForPrompt('hello', [])).toBe('hello');
    expect(formatAttachmentsForPrompt(undefined, [])).toBe('');
  });

  it('folds captured content under a descriptive header', () => {
    const out = formatAttachmentsForPrompt('summarize this', [
      record({
        name: 'notes.md',
        mime: 'text/markdown',
        size: 2048,
        content: 'body',
      }),
    ]);
    expect(out).toBe(
      'summarize this\n\n' +
        '--- Attached file: notes.md (text/markdown, 2.0 KB) ---\nbody',
    );
  });

  it('marks truncated files in the header', () => {
    const out = formatAttachmentsForPrompt(undefined, [
      record({content: 'x', truncated: true, name: 'a.md', size: 1}),
    ]);
    expect(out).toContain('[truncated]');
  });

  it('uses a placeholder for binary or oversized files', () => {
    const out = formatAttachmentsForPrompt(undefined, [
      record({name: 'p.png', mime: 'image/png', size: 10, content: null}),
    ]);
    expect(out).toBe(
      '--- Attached file: p.png (image/png, 10 B) ---\n' +
        '[Binary or oversized file; contents not extracted]',
    );
  });

  it('renders multiple records in order', () => {
    const out = formatAttachmentsForPrompt('q', [
      record({name: 'a.txt', size: 1, mime: undefined, content: 'A'}),
      record({name: 'b.txt', size: 1, mime: undefined, content: 'B'}),
    ]);
    expect(out.split('\n\n')).toHaveLength(3);
    expect(out).toContain('A');
    expect(out).toContain('B');
  });

  it('trims trailing whitespace from the text', () => {
    const out = formatAttachmentsForPrompt('hi   ', [
      record({content: 'x', name: 'a', size: 1}),
    ]);
    expect(out.startsWith('hi\n\n')).toBe(true);
  });
});
