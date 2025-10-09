import React from 'react';
import {FormProvider, useForm} from 'react-hook-form';
import {render, fireEvent} from '../../../../jest/test-utils';
import {DynamicDateTimeTagField} from '../DynamicDateTimeTagField';
import type {ParameterDefinition} from '../../../types/pal';

// Wrapper component to provide form context
const TestWrapper: React.FC<{
  children: React.ReactNode;
  defaultValues?: Record<string, any>;
}> = ({children, defaultValues = {}}) => {
  const methods = useForm({defaultValues});
  return <FormProvider {...methods}>{children}</FormProvider>;
};

describe('DynamicDateTimeTagField', () => {
  const mockParameter: ParameterDefinition = {
    key: 'testDateTime',
    type: 'datetime_tag',
    label: 'Test DateTime',
    required: false,
    placeholder: 'Tap to insert date/time',
    description: 'Insert current date and time',
  };

  it('should render with label and description', () => {
    const {getByText} = render(
      <TestWrapper>
        <DynamicDateTimeTagField parameter={mockParameter} />
      </TestWrapper>,
    );

    expect(getByText('Test DateTime')).toBeTruthy();
    expect(getByText('Insert current date and time')).toBeTruthy();
  });

  it('should show required indicator when required', () => {
    const requiredParameter = {...mockParameter, required: true};

    const {getByText} = render(
      <TestWrapper>
        <DynamicDateTimeTagField parameter={requiredParameter} />
      </TestWrapper>,
    );

    expect(getByText('Test DateTime*')).toBeTruthy();
  });

  it('should show placeholder text when no value', () => {
    const {getByText} = render(
      <TestWrapper>
        <DynamicDateTimeTagField parameter={mockParameter} />
      </TestWrapper>,
    );

    expect(getByText('Tap to insert date/time')).toBeTruthy();
  });

  it('should show default placeholder when no custom placeholder', () => {
    const parameterWithoutPlaceholder = {
      ...mockParameter,
      placeholder: undefined,
    };

    const {getByText} = render(
      <TestWrapper>
        <DynamicDateTimeTagField parameter={parameterWithoutPlaceholder} />
      </TestWrapper>,
    );

    expect(getByText('Tap to insert current date & time tag')).toBeTruthy();
  });

  it('should insert datetime tag when button is pressed', () => {
    const {getByTestId, getByText} = render(
      <TestWrapper>
        <DynamicDateTimeTagField parameter={mockParameter} />
      </TestWrapper>,
    );

    const button = getByTestId('dynamic-datetime-testDateTime');
    fireEvent.press(button);

    expect(getByText('Current Date & Time Tag')).toBeTruthy();
    expect(
      getByText('Will be replaced with current date/time when used'),
    ).toBeTruthy();
  });

  it('should show tag info when value is {{datetime}}', () => {
    const {getByText} = render(
      <TestWrapper defaultValues={{testDateTime: '{{datetime}}'}}>
        <DynamicDateTimeTagField parameter={mockParameter} />
      </TestWrapper>,
    );

    expect(getByText('Current Date & Time Tag')).toBeTruthy();
    expect(
      getByText('Will be replaced with current date/time when used'),
    ).toBeTruthy();
  });

  it('should be disabled when disabled prop is true', () => {
    const {getByTestId} = render(
      <TestWrapper>
        <DynamicDateTimeTagField parameter={mockParameter} disabled={true} />
      </TestWrapper>,
    );

    const button = getByTestId('dynamic-datetime-testDateTime');
    expect(button.props.accessibilityState.disabled).toBe(true);
  });

  it('should not insert tag when disabled', () => {
    const {getByTestId, queryByText} = render(
      <TestWrapper>
        <DynamicDateTimeTagField parameter={mockParameter} disabled={true} />
      </TestWrapper>,
    );

    const button = getByTestId('dynamic-datetime-testDateTime');
    fireEvent.press(button);

    // Should still show placeholder, not the tag
    expect(queryByText('Current Date & Time Tag')).toBeNull();
  });

  it('should display error message when provided', () => {
    const {getByText} = render(
      <TestWrapper>
        <DynamicDateTimeTagField
          parameter={mockParameter}
          error="This field is required"
        />
      </TestWrapper>,
    );

    expect(getByText('This field is required')).toBeTruthy();
  });

  it('should render without description when not provided', () => {
    const parameterWithoutDescription = {
      ...mockParameter,
      description: undefined,
    };

    const {queryByText} = render(
      <TestWrapper>
        <DynamicDateTimeTagField parameter={parameterWithoutDescription} />
      </TestWrapper>,
    );

    expect(queryByText('Insert current date and time')).toBeNull();
  });
});
