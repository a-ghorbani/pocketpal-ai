import React from 'react';
import {StyleSheet} from 'react-native';

import {fireEvent, render} from '../../../../jest/test-utils';

import * as untrustedContent from '../../../services/talents/untrustedContent';
import {wrapUntrusted} from '../../../services/talents/untrustedContent';

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

  describe('expanded details', () => {
    const call = {
      id: 'c0',
      type: 'function' as const,
      function: {name: 'get_weather', arguments: '{"city":"Paris"}'},
    };

    it('stays collapsed and unexpandable with no call or outcome', () => {
      const {queryByTestId} = render(<ToolUsedChip toolName="datetime" />);
      expect(queryByTestId('tool-used-chip-toggle')).toBeNull();
      expect(queryByTestId('tool-used-chip-details')).toBeNull();
    });

    it('reveals pretty arguments and the response only after a tap', () => {
      const {getByTestId, queryByTestId} = render(
        <ToolUsedChip
          toolName="get_weather"
          call={call}
          outcome={{
            callId: 'c0',
            toolName: 'get_weather',
            result: {type: 'text', summary: 'sunny'},
            responseContent: 'sunny',
          }}
        />,
      );

      expect(queryByTestId('tool-used-chip-details')).toBeNull();
      fireEvent.press(getByTestId('tool-used-chip-toggle'));

      expect(getByTestId('tool-used-chip-arguments')).toHaveTextContent(
        /"city": "Paris"/,
      );
      expect(getByTestId('tool-used-chip-response')).toHaveTextContent(/sunny/);
    });

    it('gives the tappable row a 44dp minimum target', () => {
      const {getByTestId} = render(
        <ToolUsedChip
          toolName="get_weather"
          call={call}
          outcome={{
            callId: 'c0',
            toolName: 'get_weather',
            result: {type: 'text', summary: 'sunny'},
            responseContent: 'sunny',
          }}
        />,
      );

      const toggle = getByTestId('tool-used-chip-toggle');
      expect(StyleSheet.flatten(toggle.props.style).minHeight).toBe(44);
    });

    it('does no per-token stripping while the chip is collapsed', () => {
      const spy = jest.spyOn(untrustedContent, 'stripUntrusted');
      try {
        const {getByTestId} = render(
          <ToolUsedChip
            toolName="get_weather"
            call={call}
            outcome={{
              callId: 'c0',
              toolName: 'get_weather',
              result: {type: 'text', summary: 'sunny'},
              responseContent: 'sunny',
            }}
          />,
        );
        expect(spy).not.toHaveBeenCalled();

        fireEvent.press(getByTestId('tool-used-chip-toggle'));
        expect(spy).toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
    });

    it('strips the untrusted envelope from the displayed response', () => {
      const wrapped = wrapUntrusted('the body');
      const {getByTestId} = render(
        <ToolUsedChip
          toolName="get_weather"
          call={call}
          outcome={{
            callId: 'c0',
            toolName: 'get_weather',
            result: {type: 'text', summary: wrapped},
            responseContent: wrapped,
          }}
        />,
      );

      fireEvent.press(getByTestId('tool-used-chip-toggle'));
      const response = getByTestId('tool-used-chip-response');
      expect(response).toHaveTextContent(/the body/);
      expect(response).not.toHaveTextContent(/UNTRUSTED WEB CONTENT/);
    });

    it('shows a redacted secret as redacted and never the value', () => {
      const {getByTestId, queryByText} = render(
        <ToolUsedChip
          toolName="get_weather"
          call={call}
          outcome={{
            callId: 'c0',
            toolName: 'get_weather',
            result: {type: 'text', summary: 'echo [redacted]'},
            responseContent: 'echo [redacted]',
          }}
        />,
      );

      fireEvent.press(getByTestId('tool-used-chip-toggle'));
      expect(getByTestId('tool-used-chip-response')).toHaveTextContent(
        /\[redacted\]/,
      );
      expect(queryByText(/k-12345/)).toBeNull();
    });
  });
});
