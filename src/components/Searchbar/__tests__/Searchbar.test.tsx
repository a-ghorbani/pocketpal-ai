import React from 'react';
import {render, fireEvent} from '../../../../jest/test-utils';
import {Searchbar} from '../Searchbar';

describe('Searchbar Component', () => {
  const mockOnChangeText = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render with default placeholder', () => {
    const {getByPlaceholderText} = render(
      <Searchbar value="" onChangeText={mockOnChangeText} />,
    );

    expect(getByPlaceholderText('Search...')).toBeTruthy();
  });

  it('should render with custom placeholder', () => {
    const {getByPlaceholderText} = render(
      <Searchbar
        value=""
        onChangeText={mockOnChangeText}
        placeholder="Search pals..."
      />,
    );

    expect(getByPlaceholderText('Search pals...')).toBeTruthy();
  });

  it('should display the current value', () => {
    const {getByDisplayValue} = render(
      <Searchbar value="test query" onChangeText={mockOnChangeText} />,
    );

    expect(getByDisplayValue('test query')).toBeTruthy();
  });

  it('should call onChangeText when text changes', () => {
    const {getByPlaceholderText} = render(
      <Searchbar value="" onChangeText={mockOnChangeText} />,
    );

    const input = getByPlaceholderText('Search...');
    fireEvent.changeText(input, 'new search');

    expect(mockOnChangeText).toHaveBeenCalledWith('new search');
  });

  it('should show clear icon when value is not empty', () => {
    const {UNSAFE_getByType} = render(
      <Searchbar value="test" onChangeText={mockOnChangeText} />,
    );

    // The Searchbar from react-native-paper should have clearIcon prop
    const searchbar = UNSAFE_getByType(require('react-native-paper').Searchbar);
    expect(searchbar.props.clearIcon).toBeDefined();
  });

  it('should not show clear icon when value is empty', () => {
    const {UNSAFE_getByType} = render(
      <Searchbar value="" onChangeText={mockOnChangeText} />,
    );

    const searchbar = UNSAFE_getByType(require('react-native-paper').Searchbar);
    expect(searchbar.props.clearIcon).toBeUndefined();
  });

  it('should render without blur when showBlur is false', () => {
    const {UNSAFE_queryByType} = render(
      <Searchbar value="" onChangeText={mockOnChangeText} showBlur={false} />,
    );

    // BlurView should not be rendered
    const BlurView = require('@react-native-community/blur').BlurView;
    expect(UNSAFE_queryByType(BlurView)).toBeNull();
  });

  it('should render with blur when showBlur is true', () => {
    const {UNSAFE_getByType} = render(
      <Searchbar value="" onChangeText={mockOnChangeText} showBlur={true} />,
    );

    // BlurView should be rendered
    const BlurView = require('@react-native-community/blur').BlurView;
    expect(UNSAFE_getByType(BlurView)).toBeTruthy();
  });

  it('should use custom blur intensity', () => {
    const {UNSAFE_getByType} = render(
      <Searchbar value="" onChangeText={mockOnChangeText} blurIntensity={10} />,
    );

    const BlurView = require('@react-native-community/blur').BlurView;
    const blurView = UNSAFE_getByType(BlurView);
    expect(blurView.props.blurAmount).toBe(10);
  });

  it('should use custom gradient locations', () => {
    const customLocations = [0, 0.2, 1];
    const {UNSAFE_getByType} = render(
      <Searchbar
        value=""
        onChangeText={mockOnChangeText}
        gradientLocations={customLocations}
      />,
    );

    const LinearGradient = require('react-native-linear-gradient').default;
    const gradient = UNSAFE_getByType(LinearGradient);
    expect(gradient.props.locations).toEqual(customLocations);
  });
});
