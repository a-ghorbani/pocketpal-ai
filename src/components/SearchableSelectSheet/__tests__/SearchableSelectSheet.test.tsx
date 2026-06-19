import React from 'react';
import {fireEvent} from '@testing-library/react-native';

import {render} from '../../../../jest/test-utils';

import {SearchableSelectSheet} from '../SearchableSelectSheet';

const options = [
  {value: 'na', label: 'Auto'},
  {value: 'ar', label: 'Arabic'},
  {value: 'ja', label: 'Japanese'},
];

const renderSheet = (
  props: Partial<React.ComponentProps<typeof SearchableSelectSheet>> = {},
) =>
  render(
    <SearchableSelectSheet
      isVisible
      onClose={jest.fn()}
      title="Language"
      searchPlaceholder="Search languages"
      options={options}
      value="na"
      onSelect={jest.fn()}
      {...props}
    />,
  );

describe('SearchableSelectSheet', () => {
  it('renders the container and all options when visible', () => {
    const {getByTestId} = renderSheet();
    expect(getByTestId('searchable-select-sheet')).toBeTruthy();
    expect(getByTestId('searchable-select-option-na')).toBeTruthy();
    expect(getByTestId('searchable-select-option-ar')).toBeTruthy();
    expect(getByTestId('searchable-select-option-ja')).toBeTruthy();
  });

  it('renders no content when not visible', () => {
    const {queryByTestId} = renderSheet({isVisible: false});
    expect(queryByTestId('searchable-select-sheet')).toBeNull();
    expect(queryByTestId('searchable-select-option-na')).toBeNull();
  });

  it('filters options case-insensitively by label', () => {
    const {getByTestId, queryByTestId} = renderSheet();
    fireEvent.changeText(getByTestId('searchable-select-search'), 'JAP');
    expect(getByTestId('searchable-select-option-ja')).toBeTruthy();
    expect(queryByTestId('searchable-select-option-ar')).toBeNull();
    expect(queryByTestId('searchable-select-option-na')).toBeNull();
  });

  it('keeps "Auto" reachable via search', () => {
    const {getByTestId, queryByTestId} = renderSheet();
    fireEvent.changeText(getByTestId('searchable-select-search'), 'auto');
    expect(getByTestId('searchable-select-option-na')).toBeTruthy();
    expect(queryByTestId('searchable-select-option-ja')).toBeNull();
  });

  it('marks the selected row as selected', () => {
    const {getByTestId} = renderSheet({value: 'ja'});
    expect(
      getByTestId('searchable-select-option-ja').props.accessibilityState
        .selected,
    ).toBe(true);
    expect(
      getByTestId('searchable-select-option-na').props.accessibilityState
        .selected,
    ).toBe(false);
  });

  it('selecting a row calls onSelect then onClose', () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();
    const {getByTestId} = renderSheet({onSelect, onClose});
    fireEvent.press(getByTestId('searchable-select-option-ja'));
    expect(onSelect).toHaveBeenCalledWith('ja');
    expect(onClose).toHaveBeenCalled();
  });

  it('honours custom testID prefixes', () => {
    const {getByTestId} = renderSheet({
      testID: 'tts-language-sheet',
      searchTestID: 'tts-language-search',
      optionTestIDPrefix: 'tts-language-option',
    });
    expect(getByTestId('tts-language-sheet')).toBeTruthy();
    expect(getByTestId('tts-language-search')).toBeTruthy();
    expect(getByTestId('tts-language-option-ja')).toBeTruthy();
  });
});
