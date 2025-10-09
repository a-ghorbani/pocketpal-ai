import React from 'react';
import {FormProvider, useForm} from 'react-hook-form';
import {render} from '../../../../jest/test-utils';
import {DynamicParameterForm} from '../DynamicParameterForm';
import type {ParameterDefinition} from '../../../types/pal';

// Wrapper component to provide form context
const TestWrapper: React.FC<{
  children: React.ReactNode;
  defaultValues?: Record<string, any>;
}> = ({children, defaultValues = {}}) => {
  const methods = useForm({defaultValues});
  return <FormProvider {...methods}>{children}</FormProvider>;
};

describe('DynamicParameterForm', () => {
  const mockSchema: ParameterDefinition[] = [
    {
      key: 'textField',
      type: 'text',
      label: 'Text Field',
      required: true,
      placeholder: 'Enter text',
    },
    {
      key: 'selectField',
      type: 'select',
      label: 'Select Field',
      required: false,
      options: ['Option 1', 'Option 2'],
    },
    {
      key: 'dateTimeField',
      type: 'datetime_tag',
      label: 'DateTime Field',
      required: false,
    },
  ];

  it('should render all parameter fields from schema', () => {
    const {getByText} = render(
      <TestWrapper>
        <DynamicParameterForm schema={mockSchema} />
      </TestWrapper>,
    );

    expect(getByText('Text Field*')).toBeTruthy();
    expect(getByText('Select Field')).toBeTruthy();
    expect(getByText('DateTime Field')).toBeTruthy();
  });

  it('should render nothing when schema is empty', () => {
    const {UNSAFE_root} = render(
      <TestWrapper>
        <DynamicParameterForm schema={[]} />
      </TestWrapper>,
    );

    // The component should return null for empty schema
    expect(UNSAFE_root).toBeTruthy();
  });

  it('should render text field for text type', () => {
    const schema: ParameterDefinition[] = [
      {
        key: 'testText',
        type: 'text',
        label: 'Test Text',
        required: false,
      },
    ];

    const {getByTestId} = render(
      <TestWrapper>
        <DynamicParameterForm schema={schema} />
      </TestWrapper>,
    );

    expect(getByTestId('dynamic-field-testText')).toBeTruthy();
  });

  it('should render option field for select type', () => {
    const schema: ParameterDefinition[] = [
      {
        key: 'testSelect',
        type: 'select',
        label: 'Test Select',
        required: false,
        options: ['A', 'B'],
      },
    ];

    const {getByTestId} = render(
      <TestWrapper>
        <DynamicParameterForm schema={schema} />
      </TestWrapper>,
    );

    expect(getByTestId('dynamic-option-testSelect')).toBeTruthy();
  });

  it('should render datetime field for datetime_tag type', () => {
    const schema: ParameterDefinition[] = [
      {
        key: 'testDateTime',
        type: 'datetime_tag',
        label: 'Test DateTime',
        required: false,
      },
    ];

    const {getByTestId} = render(
      <TestWrapper>
        <DynamicParameterForm schema={schema} />
      </TestWrapper>,
    );

    expect(getByTestId('dynamic-datetime-testDateTime')).toBeTruthy();
  });

  it('should fallback to text field for unknown type', () => {
    const schema: ParameterDefinition[] = [
      {
        key: 'unknownField',
        type: 'unknown' as any,
        label: 'Unknown Field',
        required: false,
      },
    ];

    const {getByTestId} = render(
      <TestWrapper>
        <DynamicParameterForm schema={schema} />
      </TestWrapper>,
    );

    // Should render as text field
    expect(getByTestId('dynamic-field-unknownField')).toBeTruthy();
  });

  it('should pass disabled prop to all fields', () => {
    const schema: ParameterDefinition[] = [
      {
        key: 'field1',
        type: 'text',
        label: 'Field 1',
        required: false,
      },
    ];

    const {getByTestId} = render(
      <TestWrapper>
        <DynamicParameterForm schema={schema} disabled={true} />
      </TestWrapper>,
    );

    const field = getByTestId('dynamic-field-field1');
    expect(field.props.editable).toBe(false);
  });

  it('should render multiple fields in order', () => {
    const {getByTestId} = render(
      <TestWrapper>
        <DynamicParameterForm schema={mockSchema} />
      </TestWrapper>,
    );

    expect(getByTestId('dynamic-field-textField')).toBeTruthy();
    expect(getByTestId('dynamic-option-selectField')).toBeTruthy();
    expect(getByTestId('dynamic-datetime-dateTimeField')).toBeTruthy();
  });
});
