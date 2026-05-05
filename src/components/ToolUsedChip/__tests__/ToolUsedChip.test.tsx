import React from 'react';

import {render} from '../../../../jest/test-utils';

import {ToolUsedChip} from '../ToolUsedChip';

jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => {
  const {Text: PaperText} = require('react-native-paper');
  return props => <PaperText>{props.name}</PaperText>;
});

describe('ToolUsedChip', () => {
  it('renders the chip with the tool name (en l10n template)', () => {
    const {getByText, getByTestId} = render(
      <ToolUsedChip toolName="datetime" />,
    );
    expect(getByTestId('tool-used-chip')).toBeTruthy();
    expect(getByText('used datetime')).toBeTruthy();
    // Subtle: shows wrench icon, no card chrome.
    expect(getByText('wrench-outline')).toBeTruthy();
  });

  it('renders nothing when toolName is empty', () => {
    const {queryByTestId} = render(<ToolUsedChip toolName="" />);
    expect(queryByTestId('tool-used-chip')).toBeNull();
  });
});
