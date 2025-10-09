import React from 'react';
import {FormProvider, useForm} from 'react-hook-form';
import {render, fireEvent} from '../../../../jest/test-utils';
import {DynamicTextField} from '../DynamicTextField';
import type {ParameterDefinition} from '../../../types/pal';

// Wrapper component to provide form context
const TestWrapper: React.FC<{
  children: React.ReactNode;
  defaultValues?: Record<string, any>;
}> = ({children, defaultValues = {}}) => {
  const methods = useForm({defaultValues});
  return <FormProvider {...methods}>{children}</FormProvider>;
};

describe('DynamicTextField', () => {
  const mockParameter: ParameterDefinition = {
    key: 'testField',
    type: 'text',
    label: 'Test Field',
    required: false,
    placeholder: 'Enter test value',
    description: 'This is a test field',
  };

  it('should render with label and description', () => {
    const {getByText} = render(
      <TestWrapper>
        <DynamicTextField parameter={mockParameter} />
      </TestWrapper>,
    );

    expect(getByText('Test Field')).toBeTruthy();
    expect(getByText('This is a test field')).toBeTruthy();
  });

  it('should show required indicator when required', () => {
    const requiredParameter = {...mockParameter, required: true};

    const {getByText} = render(
      <TestWrapper>
        <DynamicTextField parameter={requiredParameter} />
      </TestWrapper>,
    );

    expect(getByText('Test Field*')).toBeTruthy();
  });

  it('should render input field with placeholder', () => {
    const {getByPlaceholderText} = render(
      <TestWrapper>
        <DynamicTextField parameter={mockParameter} />
      </TestWrapper>,
    );

    expect(getByPlaceholderText('Enter test value')).toBeTruthy();
  });

  it('should handle text input changes', () => {
    const {getByTestId} = render(
      <TestWrapper>
        <DynamicTextField parameter={mockParameter} />
      </TestWrapper>,
    );

    const input = getByTestId('dynamic-field-testField');
    fireEvent.changeText(input, 'New value');

    expect(input.props.value).toBe('New value');
  });

  it('should display error message when provided', () => {
    const {getByText} = render(
      <TestWrapper>
        <DynamicTextField
          parameter={mockParameter}
          error="This field is required"
        />
      </TestWrapper>,
    );

    expect(getByText('This field is required')).toBeTruthy();
  });

  it('should be disabled when disabled prop is true', () => {
    const {getByTestId} = render(
      <TestWrapper>
        <DynamicTextField parameter={mockParameter} disabled={true} />
      </TestWrapper>,
    );

    const input = getByTestId('dynamic-field-testField');
    expect(input.props.editable).toBe(false);
  });

  it('should render without description when not provided', () => {
    const parameterWithoutDescription = {
      ...mockParameter,
      description: undefined,
    };

    const {queryByText} = render(
      <TestWrapper>
        <DynamicTextField parameter={parameterWithoutDescription} />
      </TestWrapper>,
    );

    expect(queryByText('This is a test field')).toBeNull();
  });

  it('should use default value from form context', () => {
    const {getByTestId} = render(
      <TestWrapper defaultValues={{testField: 'Initial value'}}>
        <DynamicTextField parameter={mockParameter} />
      </TestWrapper>,
    );

    const input = getByTestId('dynamic-field-testField');
    expect(input.props.value).toBe('Initial value');
  });
});
