import React from 'react';

import {fireEvent, render} from '../../../../jest/test-utils';

import {DocumentChip, formatTokenCount} from '../DocumentChip';
import type {DocumentRef} from '../../../services/documents/types';

const pdf: DocumentRef = {
  id: 'doc-1',
  name: 'report.pdf',
  kind: 'pdf',
  byteSize: 100,
  pageCount: 12,
  charCount: 12400,
  tokenEstimate: 3100,
};

describe('DocumentChip', () => {
  it('shows name, pages and the estimated tokens', () => {
    const {getByText} = render(
      <DocumentChip name="report.pdf" documentRef={pdf} />,
    );
    expect(getByText('report.pdf')).toBeTruthy();
    expect(getByText('12 pages · ~3.1k tokens')).toBeTruthy();
  });

  it('prefers the exact count when present', () => {
    const {getByText} = render(
      <DocumentChip
        name="report.pdf"
        documentRef={{...pdf, tokenCount: {modelId: 'm', n: 2900}}}
      />,
    );
    expect(getByText('12 pages · ~2.9k tokens')).toBeTruthy();
  });

  it('shows the chosen range', () => {
    const {getByText} = render(
      <DocumentChip
        name="x.pdf"
        documentRef={{
          ...pdf,
          pageCount: 40,
          pageRange: {from: 3, to: 5},
          tokenEstimate: 1400,
        }}
      />,
    );
    expect(getByText('p. 3–5 of 40 · ~1.4k tokens')).toBeTruthy();
  });

  it('asks for pages when a range is needed', () => {
    const {getByText} = render(
      <DocumentChip
        name="big.pdf"
        status="needs_range"
        documentRef={{...pdf, pageCount: 1200}}
      />,
    );
    expect(getByText('1200 pages · choose pages')).toBeTruthy();
  });

  it('shows progress while importing', () => {
    const {getByTestId, queryByTestId} = render(
      <DocumentChip name="a.pdf" status="importing" />,
    );
    expect(getByTestId('document-chip-progress')).toBeTruthy();
    expect(queryByTestId('document-chip-details')).toBeNull();
  });

  it('offers remove only when a handler is given', () => {
    const onRemove = jest.fn();
    const {getByTestId, rerender, queryByTestId} = render(
      <DocumentChip name="a.pdf" documentRef={pdf} onRemove={onRemove} />,
    );
    fireEvent.press(getByTestId('document-chip-remove'));
    expect(onRemove).toHaveBeenCalled();
    rerender(<DocumentChip name="a.pdf" documentRef={pdf} />);
    expect(queryByTestId('document-chip-remove')).toBeNull();
  });

  it('formats small and large counts', () => {
    expect(formatTokenCount(950)).toBe('950');
    expect(formatTokenCount(20480)).toBe('20.5k');
  });

  it('says in full with the token count (RA)', () => {
    const {getByText, getByTestId} = render(
      <DocumentChip name="report.pdf" documentRef={pdf} mode="full" />,
    );
    expect(getByText('12 pages · in full · ~3.1k tokens')).toBeTruthy();
    expect(getByTestId('document-chip').props.accessibilityLabel).toContain(
      'in full',
    );
  });

  it('says searched without a token count', () => {
    const {getByText, getByTestId} = render(
      <DocumentChip name="report.pdf" documentRef={pdf} mode="searched" />,
    );
    expect(getByText('12 pages · searched')).toBeTruthy();
    expect(getByTestId('document-chip').props.accessibilityLabel).toContain(
      'searched',
    );
  });

  it('offers Search instead when given', () => {
    const onSearchInstead = jest.fn();
    const {getByTestId} = render(
      <DocumentChip
        name="report.pdf"
        documentRef={pdf}
        mode="full"
        onSearchInstead={onSearchInstead}
      />,
    );
    fireEvent.press(getByTestId('document-chip-search-instead'));
    expect(onSearchInstead).toHaveBeenCalled();
  });
});
