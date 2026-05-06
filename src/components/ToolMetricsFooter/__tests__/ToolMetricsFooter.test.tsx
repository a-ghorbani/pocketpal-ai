import React from 'react';

import {render} from '../../../../jest/test-utils';

import {ToolMetricsFooter} from '../ToolMetricsFooter';

describe('ToolMetricsFooter', () => {
  it('renders tokens + seconds when metrics are present', () => {
    const {getByTestId, getByText} = render(
      <ToolMetricsFooter metrics={{tokens: 1500, durationMs: 35000}} />,
    );
    expect(getByTestId('tool-metrics-footer')).toBeTruthy();
    // Locale-formatted number, then seconds.
    expect(getByText(/1.500 tokens.+35s/)).toBeTruthy();
  });

  it('renders nothing when tokens is 0 (graceful degradation)', () => {
    const {queryByTestId} = render(
      <ToolMetricsFooter metrics={{tokens: 0, durationMs: 1234}} />,
    );
    expect(queryByTestId('tool-metrics-footer')).toBeNull();
  });

  it('floors sub-1s durations to "1s" so the footer never reads "0s"', () => {
    const {getByText} = render(
      <ToolMetricsFooter metrics={{tokens: 5, durationMs: 200}} />,
    );
    expect(getByText(/5 tokens.+1s/)).toBeTruthy();
  });
});
