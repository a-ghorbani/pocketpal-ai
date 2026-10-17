import {
  DOCUMENT_LEAD,
  documentKey,
  renderDocumentBlock,
  renderDocumentContent,
} from '../render';
import type {DocumentRef} from '../types';

const pdf = (overrides: Partial<DocumentRef> = {}): DocumentRef => ({
  id: 'abcdef12-3456-4789-8abc-def012345678',
  name: 'report.pdf',
  kind: 'pdf',
  byteSize: 1000,
  pageCount: 3,
  charCount: 0,
  tokenEstimate: 0,
  ...overrides,
});

const text = (overrides: Partial<DocumentRef> = {}): DocumentRef => ({
  id: '99999999-0000-4000-8000-000000000000',
  name: 'notes.md',
  kind: 'text',
  byteSize: 10,
  charCount: 0,
  tokenEstimate: 0,
  ...overrides,
});

describe('renderDocumentBlock', () => {
  it('renders a whole PDF with page markers and an id-derived delimiter', () => {
    expect(renderDocumentBlock(pdf(), ['one ', '  two', 'three'])).toBe(
      [
        '[Attached document "report.pdf", 3 pages]',
        '<<<BEGIN DOCUMENT abcdef12>>>',
        '=== Page 1 ===',
        'one',
        '=== Page 2 ===',
        'two',
        '=== Page 3 ===',
        'three',
        '<<<END DOCUMENT abcdef12>>>',
      ].join('\n'),
    );
  });

  it('numbers pages from the range start and names the range', () => {
    const block = renderDocumentBlock(
      pdf({pageCount: 40, pageRange: {from: 3, to: 5}}),
      ['c', 'd', 'e'],
    );
    expect(block.split('\n')[0]).toBe(
      '[Attached document "report.pdf", pages 3–5 of 40]',
    );
    expect(block).toContain('=== Page 3 ===\nc');
    expect(block).toContain('=== Page 5 ===\ne');
    expect(block).not.toContain('=== Page 1 ===');
  });

  it('marks a page without text', () => {
    expect(renderDocumentBlock(pdf({pageCount: 1}), ['  '])).toContain(
      '=== Page 1 ===\n(no text on this page)',
    );
  });

  it('renders a text file without page markers', () => {
    expect(renderDocumentBlock(text(), ['# Title\nbody\n'])).toBe(
      [
        '[Attached document "notes.md"]',
        '<<<BEGIN DOCUMENT 99999999>>>',
        '# Title\nbody',
        '<<<END DOCUMENT 99999999>>>',
      ].join('\n'),
    );
  });

  it('is byte-identical for equal inputs', () => {
    const ref = pdf();
    const pages = ['a', 'b', 'c'];
    expect(renderDocumentBlock(ref, [...pages])).toBe(
      renderDocumentBlock({...ref}, [...pages]),
    );
  });
});

describe('renderDocumentContent', () => {
  it('puts the lead line before the blocks in attach order', () => {
    const content = renderDocumentContent([
      {ref: pdf({pageCount: 1}), pages: ['x']},
      {ref: text(), pages: ['y']},
    ]);
    expect(
      content.startsWith(`${DOCUMENT_LEAD}\n\n[Attached document "report.pdf"`),
    ).toBe(true);
    expect(content.indexOf('report.pdf')).toBeLessThan(
      content.indexOf('notes.md'),
    );
  });

  it('renders a missing document as one notice line', () => {
    expect(renderDocumentContent([{ref: text(), missing: true}])).toBe(
      `${DOCUMENT_LEAD}\n\n[Attached document "notes.md" is no longer available]`,
    );
  });
});

describe('documentKey', () => {
  it('distinguishes ranges of one id', () => {
    expect(documentKey(pdf())).toBe(`${pdf().id}:all`);
    expect(documentKey(pdf({pageRange: {from: 3, to: 5}}))).toBe(
      `${pdf().id}:3-5`,
    );
  });
});
