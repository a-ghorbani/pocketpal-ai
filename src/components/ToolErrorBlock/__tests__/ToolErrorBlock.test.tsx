import React from 'react';

import {render} from '../../../../jest/test-utils';

import {ToolErrorBlock} from '../ToolErrorBlock';

jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => {
  const {Text: PaperText} = require('react-native-paper');
  return props => <PaperText>{props.name}</PaperText>;
});

describe('ToolErrorBlock', () => {
  it('renders the error block with name + message when message provided', () => {
    const {getByTestId, getByText} = render(
      <ToolErrorBlock
        toolName="render_html"
        errorMessage="invalid markup"
      />,
    );
    expect(getByTestId('tool-error-block')).toBeTruthy();
    expect(getByText('render_html failed')).toBeTruthy();
    expect(getByText('invalid markup')).toBeTruthy();
    expect(getByText('alert-circle-outline')).toBeTruthy();
  });

  it('renders the error block without a message line when errorMessage missing', () => {
    const {getByText, queryByTestId} = render(
      <ToolErrorBlock toolName="datetime" />,
    );
    expect(getByText('datetime failed')).toBeTruthy();
    expect(queryByTestId('tool-error-block-message')).toBeNull();
  });

  it('renders nothing when toolName is empty', () => {
    const {queryByTestId} = render(<ToolErrorBlock toolName="" />);
    expect(queryByTestId('tool-error-block')).toBeNull();
  });
});
