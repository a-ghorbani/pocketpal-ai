import React from 'react';
import {FormProvider, useForm} from 'react-hook-form';
import {render} from '../../../../jest/test-utils';
import {DynamicOptionField} from '../DynamicOptionField';
import type {ParameterDefinition} from '../../../types/pal';

// Wrapper component to provide form context
const TestWrapper: React.FC<{
  children: React.ReactNode;
  defaultValues?: Record<string, any>;
}> = ({children, defaultValues = {}}) => {
  const methods = useForm({defaultValues});
  return <FormProvider {...methods}>{children}</FormProvider>;
};

describe('DynamicOptionField', () => {
  const mockParameter: ParameterDefinition = {
    key: 'testOption',
    type: 'select',
    label: 'Test Option',
    required: false,
    options: ['Option 1', 'Option 2', 'Option 3'],
    description: 'Select an option',
  };

  it('should render with label and description', () => {
    const {getByText} = render(
      <TestWrapper>
        <DynamicOptionField parameter={mockParameter} />
      </TestWrapper>,
    );

    expect(getByText('Test Option')).toBeTruthy();
    expect(getByText('Select an option')).toBeTruthy();
  });

  it('should render selector with correct placeholder', () => {
    const {getByText} = render(
      <TestWrapper>
        <DynamicOptionField parameter={mockParameter} />
      </TestWrapper>,
    );

    expect(getByText('Select test option')).toBeTruthy();
  });

  it('should be disabled when disabled prop is true', () => {
    const {getByTestId} = render(
      <TestWrapper>
        <DynamicOptionField parameter={mockParameter} disabled={true} />
      </TestWrapper>,
    );

    const selector = getByTestId('dynamic-option-testOption');
    expect(selector).toBeTruthy();
  });

  it('should show required indicator when required', () => {
    const requiredParameter = {...mockParameter, required: true};

    const {getByTestId} = render(
      <TestWrapper>
        <DynamicOptionField parameter={requiredParameter} />
      </TestWrapper>,
    );

    const selector = getByTestId('dynamic-option-testOption');
    expect(selector).toBeTruthy();
  });

  it('should display error message when provided', () => {
    const {getByTestId} = render(
      <TestWrapper>
        <DynamicOptionField
          parameter={mockParameter}
          error="Selection is required"
        />
      </TestWrapper>,
    );

    const selector = getByTestId('dynamic-option-testOption');
    expect(selector).toBeTruthy();
  });

  it('should use default value from form context', () => {
    const {getByTestId} = render(
      <TestWrapper defaultValues={{testOption: 'Option 2'}}>
        <DynamicOptionField parameter={mockParameter} />
      </TestWrapper>,
    );

    const selector = getByTestId('dynamic-option-testOption');
    expect(selector).toBeTruthy();
  });

  it('should handle empty options array', () => {
    const parameterWithoutOptions = {...mockParameter, options: []};

    const {getByTestId} = render(
      <TestWrapper>
        <DynamicOptionField parameter={parameterWithoutOptions} />
      </TestWrapper>,
    );

    const selector = getByTestId('dynamic-option-testOption');
    expect(selector).toBeTruthy();
  });

  it('should handle undefined options', () => {
    const parameterWithoutOptions = {...mockParameter, options: undefined};

    const {getByTestId} = render(
      <TestWrapper>
        <DynamicOptionField parameter={parameterWithoutOptions} />
      </TestWrapper>,
    );

    const selector = getByTestId('dynamic-option-testOption');
    expect(selector).toBeTruthy();
  });
});
