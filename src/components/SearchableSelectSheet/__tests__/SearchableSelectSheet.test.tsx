import React from 'react';
import {Dimensions} from 'react-native';
import {fireEvent} from '@testing-library/react-native';
import {
  BottomSheetTextInput,
  useBottomSheetInternal,
} from '@gorhom/bottom-sheet';
import {useSafeAreaFrame} from 'react-native-safe-area-context';

import {render} from '../../../../jest/test-utils';
import {
  mockSheetContext,
  type MockSheetContext,
} from '../../../../jest/sheetContext';

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

  it('clears the query on the selection path so a reopen is unfiltered', () => {
    const {getByTestId, queryByTestId, rerender} = renderSheet();
    fireEvent.changeText(getByTestId('searchable-select-search'), 'JAP');
    expect(queryByTestId('searchable-select-option-ar')).toBeNull();

    fireEvent.press(getByTestId('searchable-select-option-ja'));

    rerender(
      <SearchableSelectSheet
        isVisible
        onClose={jest.fn()}
        title="Language"
        searchPlaceholder="Search languages"
        options={options}
        value="ja"
        onSelect={jest.fn()}
      />,
    );
    expect(getByTestId('searchable-select-search').props.value).toBe('');
    expect(getByTestId('searchable-select-option-na')).toBeTruthy();
    expect(getByTestId('searchable-select-option-ar')).toBeTruthy();
    expect(getByTestId('searchable-select-option-ja')).toBeTruthy();
  });

  it('renders an empty state when the query matches nothing', () => {
    const {getByTestId, queryByTestId} = renderSheet();
    fireEvent.changeText(getByTestId('searchable-select-search'), 'zzz');
    expect(getByTestId('searchable-select-sheet-empty')).toBeTruthy();
    expect(queryByTestId('searchable-select-option-na')).toBeNull();
    expect(queryByTestId('searchable-select-option-ar')).toBeNull();
    expect(queryByTestId('searchable-select-option-ja')).toBeNull();
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

  describe('search input in the sheet', () => {
    const FIELD_TAG = 42;
    const screen = Dimensions.get('screen');
    const jestSetupFrame = (
      useSafeAreaFrame as jest.Mock
    ).getMockImplementation();
    let sheet: MockSheetContext;

    beforeEach(() => {
      sheet = mockSheetContext();
      (useBottomSheetInternal as jest.Mock).mockReturnValue(sheet);
    });

    afterEach(() => {
      (useBottomSheetInternal as jest.Mock).mockReturnValue(null);
      (useSafeAreaFrame as jest.Mock).mockReset();
      (useSafeAreaFrame as jest.Mock).mockImplementation(jestSetupFrame);
    });

    const focusSearchIn = (frameHeight: number) => {
      (useSafeAreaFrame as jest.Mock).mockReturnValue({
        x: 0,
        y: 0,
        width: screen.width,
        height: frameHeight,
      });
      const utils = renderSheet();
      fireEvent(utils.getByTestId('searchable-select-search'), 'focus', {
        nativeEvent: {target: FIELD_TAG},
      });
      return utils;
    };

    it('renders the search input as an RN TextInput', () => {
      const {UNSAFE_queryByType, getByTestId} = focusSearchIn(screen.height);

      expect(UNSAFE_queryByType(BottomSheetTextInput)).toBeNull();
      expect(getByTestId('searchable-select-search').type).toBe('TextInput');
    });

    it('sets its keyboard target on focus when the app window fills the screen', () => {
      focusSearchIn(screen.height);

      expect(sheet.keyboardState.target).toBe(FIELD_TAG);
    });

    it('writes no keyboard target on focus when the app window is a split pane', () => {
      focusSearchIn(screen.height - 100);

      expect(sheet.keyboardState.target).toBeUndefined();
      expect(sheet.animatedKeyboardState.set).not.toHaveBeenCalled();
    });
  });
});
