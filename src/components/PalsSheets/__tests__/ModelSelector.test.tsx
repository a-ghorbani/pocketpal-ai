import React from 'react';
import {render} from '../../../../jest/test-utils';
import {ModelSelector} from '../ModelSelector';
import {modelsList} from '../../../../jest/fixtures/models';

// Mock the modelStore
jest.mock('../../../store', () => ({
  modelStore: {
    availableModels: [
      {id: 'model-1', name: 'basic model'},
      {id: 'model-2', name: 'downloaded model'},
      {id: 'model-3', name: 'downloading model'},
    ],
  },
}));

describe('ModelSelector', () => {
  const defaultProps = {
    label: 'Select Model',
    onChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with required props', () => {
    const {getByText} = render(<ModelSelector {...defaultProps} />);

    expect(getByText('Select Model')).toBeDefined();
    expect(getByText('Select model')).toBeDefined(); // This is now the button text, not placeholder
  });

  it('shows required asterisk when required prop is true', () => {
    const {getByText} = render(<ModelSelector {...defaultProps} required />);

    expect(getByText('Select Model*')).toBeDefined();
  });

  it('displays selected model name when value is provided', () => {
    const {getByText} = render(
      <ModelSelector {...defaultProps} value={modelsList[0]} />,
    );

    // The selected model name should be displayed as button text
    expect(getByText(modelsList[0].name)).toBeDefined();
  });

  it('displays helper text when provided', () => {
    const {getByText} = render(
      <ModelSelector {...defaultProps} helperText="Helper message" />,
    );

    expect(getByText('Helper message')).toBeDefined();
  });

  it('uses custom placeholder when provided', () => {
    const {getByText} = render(
      <ModelSelector {...defaultProps} placeholder="Custom placeholder" />,
    );

    expect(getByText('Custom placeholder')).toBeDefined();
  });

  it('applies filter when provided', () => {
    const filter = (model: any) => model.name.includes('basic');
    const {getByTestId} = render(
      <ModelSelector
        {...defaultProps}
        filter={filter}
        testID="model-selector"
      />,
    );

    // The component should render (filter is applied internally)
    expect(getByTestId('model-selector')).toBeDefined();
  });

  it('passes through disabled prop', () => {
    const {getByTestId} = render(
      <ModelSelector {...defaultProps} disabled testID="model-selector" />,
    );

    expect(getByTestId('model-selector')).toBeDefined();
  });

  it('passes through error prop', () => {
    const {getByTestId} = render(
      <ModelSelector {...defaultProps} error testID="model-selector" />,
    );

    expect(getByTestId('model-selector')).toBeDefined();
  });
});
