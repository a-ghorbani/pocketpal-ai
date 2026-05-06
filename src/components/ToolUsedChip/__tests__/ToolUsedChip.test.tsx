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

  it('appends generation metrics when present', () => {
    const {getByText} = render(
      <ToolUsedChip
        toolName="calculate"
        metrics={{tokens: 19, durationMs: 2300}}
      />,
    );
    // Format: `used calculate · 19 tokens · 2s` (rounded seconds, min 1).
    expect(getByText(/used calculate.+19 tokens.+2s/)).toBeTruthy();
  });

  it('omits metrics when tokens is 0 (graceful degradation for older calls)', () => {
    const {getByText, queryByText} = render(
      <ToolUsedChip
        toolName="calculate"
        metrics={{tokens: 0, durationMs: 0}}
      />,
    );
    expect(getByText('used calculate')).toBeTruthy();
    expect(queryByText(/tokens/)).toBeNull();
  });

  it('floors sub-1s durations to "1s" so the suffix never reads "0s"', () => {
    const {getByText} = render(
      <ToolUsedChip
        toolName="calculate"
        metrics={{tokens: 4, durationMs: 200}}
      />,
    );
    expect(getByText(/4 tokens.+1s/)).toBeTruthy();
  });
});
