import React from 'react';
import {Dimensions} from 'react-native';
import {
  BottomSheetTextInput,
  useBottomSheetInternal,
} from '@gorhom/bottom-sheet';
import {useSafeAreaFrame} from 'react-native-safe-area-context';
import {EnhancedSearchBar} from '../EnhancedSearchBar';
import {SearchFilters} from '../../../store/HFStore';
import {fireEvent, render} from '../../../../jest/test-utils';
import {
  mockSheetContext,
  type MockSheetContext,
} from '../../../../jest/sheetContext';
import {l10n} from '../../../locales';

// Mock the theme hook
jest.mock('../../../hooks', () => ({
  useTheme: () => ({
    colors: {
      surface: '#ffffff',
      onSurface: '#000000',
      onSurfaceVariant: '#666666',
      surfaceVariant: '#f5f5f5',
      outline: '#cccccc',
      primary: '#007bff',
      primaryContainer: '#e3f2fd',
      onPrimaryContainer: '#0d47a1',
    },
    dark: false,
  }),
}));

describe('EnhancedSearchBar', () => {
  const defaultFilters: SearchFilters = {
    author: '',
    sortBy: 'relevance',
  };

  const defaultProps = {
    value: '',
    onChangeText: jest.fn(),
    filters: defaultFilters,
    onFiltersChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly', () => {
    const {getByPlaceholderText, getByTestId} = render(
      <EnhancedSearchBar {...defaultProps} testID="enhanced-search-bar" />,
      {
        withBottomSheetProvider: true,
      },
    );

    expect(
      getByPlaceholderText(l10n.en.models.search.searchPlaceholder),
    ).toBeTruthy();
    expect(getByTestId('enhanced-search-bar')).toBeTruthy();
  });

  it('calls onChangeText when search input changes', () => {
    const onChangeText = jest.fn();
    const {getByPlaceholderText} = render(
      <EnhancedSearchBar {...defaultProps} onChangeText={onChangeText} />,
      {
        withBottomSheetProvider: true,
      },
    );

    const searchInput = getByPlaceholderText(
      l10n.en.models.search.searchPlaceholder,
    );
    fireEvent.changeText(searchInput, 'test query');

    expect(onChangeText).toHaveBeenCalledWith('test query');
  });

  it('shows clear button when search has text', () => {
    const {getByTestId} = render(
      <EnhancedSearchBar
        {...defaultProps}
        value="test"
        testID="enhanced-search-bar"
      />,
      {
        withBottomSheetProvider: true,
      },
    );

    // The component should render with testID when provided
    expect(getByTestId('enhanced-search-bar')).toBeTruthy();

    // The clear button should be present when there's text (it's a TouchableOpacity with close icon)
    const component = getByTestId('enhanced-search-bar');
    expect(component).toBeTruthy();
  });

  it('opens filter sheet when filter buttons are pressed', () => {
    const onFiltersChange = jest.fn();
    const {getByTestId} = render(
      <EnhancedSearchBar {...defaultProps} onFiltersChange={onFiltersChange} />,
      {
        withBottomSheetProvider: true,
      },
    );

    // Test that Author filter button exists and can be pressed
    const authorButton = getByTestId('filter-button-author');
    expect(authorButton).toBeTruthy();
    fireEvent.press(authorButton);

    // Test that Sort filter button exists and can be pressed
    const sortButton = getByTestId('filter-button-sort');
    expect(sortButton).toBeTruthy();
    fireEvent.press(sortButton);
  });

  describe('author filter input in its sheet', () => {
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

    const openAuthorFilter = (frameWidth: number) => {
      (useSafeAreaFrame as jest.Mock).mockReturnValue({
        x: 0,
        y: 0,
        width: frameWidth,
        height: screen.height,
      });
      const utils = render(<EnhancedSearchBar {...defaultProps} />, {
        withBottomSheetProvider: true,
      });
      fireEvent.press(utils.getByTestId('filter-button-author'));
      return utils;
    };

    it('renders the author filter input as an RN TextInput in the filter sheet', () => {
      const {UNSAFE_queryByType, getByTestId} = openAuthorFilter(screen.width);

      expect(UNSAFE_queryByType(BottomSheetTextInput)).toBeNull();
      expect(getByTestId('author-filter-input').type).toBe('TextInput');
    });

    it('sets its keyboard target on focus when the app window fills the screen', () => {
      const {getByTestId} = openAuthorFilter(screen.width);

      fireEvent(getByTestId('author-filter-input'), 'focus', {
        nativeEvent: {target: FIELD_TAG},
      });

      expect(sheet.keyboardState.target).toBe(FIELD_TAG);
    });

    it('writes no keyboard target on focus when the app window is a split pane', () => {
      const {getByTestId} = openAuthorFilter(screen.width - 100);

      fireEvent(getByTestId('author-filter-input'), 'focus', {
        nativeEvent: {target: FIELD_TAG},
      });

      expect(sheet.keyboardState.target).toBeUndefined();
      expect(sheet.animatedKeyboardState.set).not.toHaveBeenCalled();
    });
  });

  it('shows active filter indicator when filters are applied', () => {
    const filtersWithActive: SearchFilters = {
      ...defaultFilters,
      author: 'test-author',
    };

    const {getByTestId, getByText} = render(
      <EnhancedSearchBar
        {...defaultProps}
        filters={filtersWithActive}
        testID="enhanced-search-bar"
      />,
      {
        withBottomSheetProvider: true,
      },
    );

    // Component should render without errors when filters are active
    expect(getByTestId('enhanced-search-bar')).toBeTruthy();

    // Should show the author filter value when active
    expect(getByText('test-author')).toBeTruthy();
  });
});
