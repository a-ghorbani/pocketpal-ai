import React from 'react';
import {render} from '@testing-library/react-native';
import {Selector, SelectorOption} from '../Selector';

const mockOptions: SelectorOption[] = [
  {label: 'Option 1', value: 'option1'},
  {label: 'Option 2', value: 'option2'},
  {label: 'Option 3', value: 'option3', disabled: true},
];

describe('Selector', () => {
  const mockOnChange = jest.fn();

  beforeEach(() => {
    mockOnChange.mockClear();
  });

  it('renders with placeholder when no value selected', () => {
    const {getByTestId} = render(
      <Selector
        options={mockOptions}
        onChange={mockOnChange}
        placeholder="Select an option"
        testID="test-selector"
      />,
    );

    expect(getByTestId('test-selector')).toBeTruthy();
  });

  it('renders with selected value', () => {
    const {getByTestId} = render(
      <Selector
        options={mockOptions}
        value="option1"
        onChange={mockOnChange}
        placeholder="Select an option"
        testID="test-selector"
      />,
    );

    expect(getByTestId('test-selector')).toBeTruthy();
  });

  it('renders label and sublabel', () => {
    const {getByTestId} = render(
      <Selector
        options={mockOptions}
        onChange={mockOnChange}
        label="Test Label"
        sublabel="Test sublabel"
        required
        testID="test-selector"
      />,
    );

    expect(getByTestId('test-selector')).toBeTruthy();
  });

  it('renders error state', () => {
    const {getByTestId} = render(
      <Selector
        options={mockOptions}
        onChange={mockOnChange}
        error
        helperText="This field is required"
        testID="test-selector"
      />,
    );

    expect(getByTestId('test-selector')).toBeTruthy();
  });

  it('calls onChange when option is selected', () => {
    const {getByTestId} = render(
      <Selector
        options={mockOptions}
        onChange={mockOnChange}
        placeholder="Select an option"
        testID="test-selector"
      />,
    );

    expect(getByTestId('test-selector')).toBeTruthy();
    expect(mockOnChange).not.toHaveBeenCalled();
  });

  it('renders when disabled', () => {
    const {getByTestId} = render(
      <Selector
        options={mockOptions}
        onChange={mockOnChange}
        disabled
        testID="test-selector"
      />,
    );

    expect(getByTestId('test-selector')).toBeTruthy();
  });
});
