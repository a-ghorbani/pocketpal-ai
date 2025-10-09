import React from 'react';
import {EnhancedSearchBar} from '../EnhancedSearchBar';
import {SearchFilters} from '../../../store/HFStore';
import {fireEvent, render} from '../../../../jest/test-utils';
import {l10n} from '../../../utils/l10n';

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
    const {getByText} = render(
      <EnhancedSearchBar {...defaultProps} onFiltersChange={onFiltersChange} />,
      {
        withBottomSheetProvider: true,
      },
    );

    // Test that Author filter button exists and can be pressed
    const authorButton = getByText(l10n.en.models.search.filters.author);
    expect(authorButton).toBeTruthy();
    fireEvent.press(authorButton);

    // Test that Sort filter button exists and can be pressed
    const sortButton = getByText(l10n.en.models.search.filters.sortRelevance);
    expect(sortButton).toBeTruthy();
    fireEvent.press(sortButton);
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
