import React from 'react';

import {fireEvent, render} from '../../../../jest/test-utils';

import {DocumentRangeSheet} from '../DocumentRangeSheet';
import type {DocumentRef} from '../../../services/documents/types';

jest.mock('../../Sheet', () => {
  const {View} = require('react-native');
  const Sheet: any = ({children, isVisible}: any) =>
    isVisible ? <View>{children}</View> : null;
  Sheet.ScrollView = ({children}: any) => <View>{children}</View>;
  Sheet.Actions = ({children}: any) => <View>{children}</View>;
  return {Sheet};
});

const doc = (pageCount: number): DocumentRef => ({
  id: 'doc-1',
  name: 'x.pdf',
  kind: 'pdf',
  byteSize: 1,
  pageCount,
  charCount: 0,
  tokenEstimate: 0,
});

const renderSheet = (ref: DocumentRef, onApply = jest.fn(), extra = {}) =>
  render(
    <DocumentRangeSheet
      isVisible
      documentRef={ref}
      onApply={onApply}
      onClose={jest.fn()}
      {...extra}
    />,
  );

describe('DocumentRangeSheet', () => {
  it('applies a range within the document', () => {
    const onApply = jest.fn();
    const {getByTestId} = renderSheet(doc(40), onApply);
    fireEvent.changeText(getByTestId('document-range-from'), '3');
    fireEvent.changeText(getByTestId('document-range-to'), '5');
    fireEvent.press(getByTestId('document-range-apply'));
    expect(onApply).toHaveBeenCalledWith(3, 5);
  });

  it('disables apply for a range outside the document', () => {
    const onApply = jest.fn();
    const {getByTestId} = renderSheet(doc(40), onApply);
    fireEvent.changeText(getByTestId('document-range-from'), '30');
    fireEvent.changeText(getByTestId('document-range-to'), '41');
    fireEvent.press(getByTestId('document-range-apply'));
    expect(onApply).not.toHaveBeenCalled();
  });

  it('disables apply for a range over the page limit and says why', () => {
    const onApply = jest.fn();
    const {getByTestId} = renderSheet(doc(1200), onApply);
    fireEvent.changeText(getByTestId('document-range-from'), '1');
    fireEvent.changeText(getByTestId('document-range-to'), '501');
    fireEvent.press(getByTestId('document-range-apply'));
    expect(onApply).not.toHaveBeenCalled();
    expect(getByTestId('document-range-limit')).toBeTruthy();
  });

  it('explains a range whose text is over the character limit', () => {
    const {getByTestId} = renderSheet(
      {...doc(40), pageRange: {from: 1, to: 40}},
      jest.fn(),
      {rangeLimit: 'too_many_chars'},
    );
    expect(getByTestId('document-range-limit')).toBeTruthy();
  });

  it('shows the page limit only after an edit makes the range too long', () => {
    const {getByTestId, queryByTestId} = renderSheet(doc(1200), jest.fn(), {
      rangeLimit: 'too_many_pages',
    });
    expect(queryByTestId('document-range-limit')).toBeNull();

    fireEvent.changeText(getByTestId('document-range-from'), '1');
    fireEvent.changeText(getByTestId('document-range-to'), '501');
    expect(getByTestId('document-range-limit')).toBeTruthy();

    fireEvent.changeText(getByTestId('document-range-to'), '500');
    expect(queryByTestId('document-range-limit')).toBeNull();
  });

  it('drops the character-limit message once the failed range is changed', () => {
    const {getByTestId, queryByTestId} = renderSheet(
      {...doc(40), pageRange: {from: 1, to: 40}},
      jest.fn(),
      {rangeLimit: 'too_many_chars'},
    );
    expect(getByTestId('document-range-limit')).toBeTruthy();

    fireEvent.changeText(getByTestId('document-range-to'), '10');
    expect(queryByTestId('document-range-limit')).toBeNull();
  });
});
