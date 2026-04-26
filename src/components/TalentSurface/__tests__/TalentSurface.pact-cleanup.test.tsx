/**
 * Additional TalentSurface tests for PACT cleanup (TASK-20260426-1600)
 *
 * Covers edge cases specific to the cleanup refactor:
 * - pendingTalentNames as empty array renders nothing
 * - Mix of different talent types in multi-call
 * - Result for one call missing while another is present
 * - Mismatched call IDs (result ID doesn't match any call)
 */
import React from 'react';

import {render} from '../../../../jest/test-utils';
import {talentUIRegistry} from '../../../services/talents/TalentUIRegistry';
import {RenderHtmlTalentUI} from '../../../services/talents/RenderHtmlTalentUI';
import type {TalentUI} from '../../../services/talents/TalentUIRegistry';
import type {TalentResult} from '../../../services/talents/types';
import {TalentSurface} from '../TalentSurface';

jest.mock('../../HtmlPreviewBubble', () => ({
  HtmlPreviewBubble: ({html, title}: {html: string; title?: string}) => {
    const {View, Text: RNText} = require('react-native');
    return (
      <View testID="html-preview-bubble">
        <RNText>{title ?? 'Preview'}</RNText>
        <RNText>{html}</RNText>
      </View>
    );
  },
}));

describe('TalentSurface (PACT cleanup edge cases)', () => {
  beforeEach(() => {
    talentUIRegistry.reset();
    talentUIRegistry.register(new RenderHtmlTalentUI());
  });

  afterEach(() => {
    talentUIRegistry.reset();
  });

  it('renders nothing when pendingTalentNames is an empty array', () => {
    const metadata = {
      pendingTalentNames: [],
    };
    const {queryByTestId, queryByText} = render(
      <TalentSurface metadata={metadata} />,
    );
    expect(queryByTestId('html-preview-bubble')).toBeNull();
    expect(queryByTestId('talent-call-pending')).toBeNull();
    expect(queryByText('Generating preview…')).toBeNull();
  });

  it('renders only the call that has a result when one of two calls has no result yet', () => {
    const metadata = {
      talentCalls: [
        {function: {name: 'render_html'}, id: 'call_1'},
        {function: {name: 'render_html'}, id: 'call_2'},
      ],
      talentResults: {
        call_1: {
          type: 'html',
          html: '<p>first</p>',
          title: 'First',
          summary: 'Rendered HTML preview: "First"',
        },
        // call_2 has no result yet
      },
      pendingTalentNames: ['render_html'],
    };
    const {getAllByTestId, getByText} = render(
      <TalentSurface metadata={metadata} />,
    );
    // call_1 rendered, call_2 shows pending
    expect(getByText('First')).toBeTruthy();
    // The pending skeleton should appear for call_2
    expect(getByText('Generating preview…')).toBeTruthy();
    // One bubble for the result, one pending skeleton
    expect(getAllByTestId('html-preview-bubble')).toHaveLength(1);
    expect(getAllByTestId('talent-call-pending')).toHaveLength(1);
  });

  it('renders nothing when talentResults has keys that do not match any call ID', () => {
    const metadata = {
      talentCalls: [{function: {name: 'render_html'}, id: 'call_1'}],
      talentResults: {
        // Mismatched ID - no call has this ID
        call_99: {
          type: 'html',
          html: '<p>orphan</p>',
          title: 'Orphan',
          summary: 'orphan',
        },
      },
    };
    const {queryByTestId} = render(<TalentSurface metadata={metadata} />);
    // call_1 has no result (call_99 doesn't match), no pending names => nothing
    expect(queryByTestId('html-preview-bubble')).toBeNull();
  });

  it('mixed talent types: only talent with registered UI renders', () => {
    // calculate has no registered TalentUI, render_html does
    const metadata = {
      talentCalls: [
        {function: {name: 'calculate'}, id: 'call_calc'},
        {function: {name: 'render_html'}, id: 'call_html'},
      ],
      talentResults: {
        call_calc: {
          type: 'text',
          summary: '2+2 = 4',
        },
        call_html: {
          type: 'html',
          html: '<p>chart</p>',
          title: 'Chart',
          summary: 'Rendered HTML preview: "Chart"',
        },
      },
    };
    const {getAllByTestId, getByText, queryByText} = render(
      <TalentSurface metadata={metadata} />,
    );
    // Only render_html has a registered UI
    expect(getAllByTestId('html-preview-bubble')).toHaveLength(1);
    expect(getByText('Chart')).toBeTruthy();
    // calculate result is not rendered (no TalentUI registered for it)
    expect(queryByText('2+2 = 4')).toBeNull();
  });

  it('three calls with same talent name all get separate rendering', () => {
    const metadata = {
      talentCalls: [
        {function: {name: 'render_html'}, id: 'call_a'},
        {function: {name: 'render_html'}, id: 'call_b'},
        {function: {name: 'render_html'}, id: 'call_c'},
      ],
      talentResults: {
        call_a: {
          type: 'html',
          html: '<p>A</p>',
          title: 'Alpha',
          summary: 'A',
        },
        call_b: {
          type: 'html',
          html: '<p>B</p>',
          title: 'Beta',
          summary: 'B',
        },
        call_c: {
          type: 'html',
          html: '<p>C</p>',
          title: 'Gamma',
          summary: 'C',
        },
      },
    };
    const {getAllByTestId, getByText} = render(
      <TalentSurface metadata={metadata} />,
    );
    expect(getAllByTestId('html-preview-bubble')).toHaveLength(3);
    expect(getByText('Alpha')).toBeTruthy();
    expect(getByText('Beta')).toBeTruthy();
    expect(getByText('Gamma')).toBeTruthy();
  });

  it('pendingTalentNames with known talent shows talent-specific pending (early streaming, no talentCalls)', () => {
    const metadata = {
      pendingTalentNames: ['render_html'],
    };
    const {getByTestId, getByText} = render(
      <TalentSurface metadata={metadata} />,
    );
    // RenderHtmlTalentUI.renderPending() is called
    expect(getByTestId('talent-call-pending')).toBeTruthy();
    expect(getByText('Generating preview…')).toBeTruthy();
  });

  it('pendingTalentNames with unknown talent shows generic skeleton', () => {
    const metadata = {
      pendingTalentNames: ['future_talent'],
    };
    const {getByTestId, getByText} = render(
      <TalentSurface metadata={metadata} />,
    );
    // Generic fallback because 'future_talent' has no registered UI
    expect(getByTestId('talent-call-pending')).toBeTruthy();
    expect(getByText('Generating preview…')).toBeTruthy();
  });

  it('pendingTalentNames with custom UI uses that UI renderPending', () => {
    const {Text} = require('react-native');
    const customUI: TalentUI = {
      name: 'custom_viz',
      renderPending() {
        return (
          <Text testID="custom-viz-pending">Building visualization...</Text>
        );
      },
      renderResult(_result: TalentResult) {
        return null;
      },
    };
    talentUIRegistry.register(customUI);

    const metadata = {
      pendingTalentNames: ['custom_viz'],
    };
    const {getByTestId, getByText} = render(
      <TalentSurface metadata={metadata} />,
    );
    expect(getByTestId('custom-viz-pending')).toBeTruthy();
    expect(getByText('Building visualization...')).toBeTruthy();
  });
});
