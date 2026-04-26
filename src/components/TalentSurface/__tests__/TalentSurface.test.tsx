import React from 'react';
import {Text} from 'react-native';

import {render} from '../../../../jest/test-utils';
import {talentUIRegistry} from '../../../services/talents/TalentUIRegistry';
import {RenderHtmlTalentUI} from '../../../services/talents/RenderHtmlTalentUI';
import {TalentUI} from '../../../services/talents/TalentUIRegistry';
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

describe('TalentSurface', () => {
  beforeEach(() => {
    talentUIRegistry.reset();
    talentUIRegistry.register(new RenderHtmlTalentUI());
  });

  afterEach(() => {
    talentUIRegistry.reset();
  });

  it('renders nothing when metadata is undefined', () => {
    const {queryByTestId, queryByText} = render(<TalentSurface />);
    expect(queryByTestId('html-preview-bubble')).toBeNull();
    expect(queryByTestId('talent-call-pending')).toBeNull();
    expect(queryByText('Generating preview…')).toBeNull();
  });

  it('renders nothing when metadata has no talentCalls and no pendingTalentNames', () => {
    const {queryByTestId, queryByText} = render(
      <TalentSurface metadata={{}} />,
    );
    expect(queryByTestId('html-preview-bubble')).toBeNull();
    expect(queryByTestId('talent-call-pending')).toBeNull();
    expect(queryByText('Generating preview…')).toBeNull();
  });

  it('renders nothing when talentCalls reference a talent with no registered UI', () => {
    const metadata = {
      talentCalls: [{function: {name: 'calculate'}, id: 'call_1'}],
    };
    const {queryByTestId, queryByText} = render(
      <TalentSurface metadata={metadata} />,
    );
    expect(queryByTestId('html-preview-bubble')).toBeNull();
    expect(queryByTestId('talent-call-pending')).toBeNull();
    expect(queryByText('Generating preview…')).toBeNull();
  });

  it('renders HtmlPreviewBubble when talentResults map has html result keyed by call ID', () => {
    const metadata = {
      talentCalls: [{function: {name: 'render_html'}, id: 'call_1'}],
      talentResults: {
        call_1: {
          type: 'html',
          html: '<p>hello</p>',
          title: 'My Preview',
          summary: 'Rendered HTML preview: "My Preview"',
        },
      },
    };
    const {getByTestId, getByText} = render(
      <TalentSurface metadata={metadata} />,
    );
    expect(getByTestId('html-preview-bubble')).toBeTruthy();
    expect(getByText('My Preview')).toBeTruthy();
    expect(getByText('<p>hello</p>')).toBeTruthy();
  });

  it('renders talent-specific pending skeleton when pendingTalentNames and talentCalls present', () => {
    const metadata = {
      talentCalls: [{function: {name: 'render_html'}, id: 'call_1'}],
      pendingTalentNames: ['render_html'],
    };
    const {getByTestId} = render(<TalentSurface metadata={metadata} />);
    expect(getByTestId('talent-call-pending')).toBeTruthy();
  });

  it('renders generic pending skeleton when pendingTalentNames but no talentCalls (streaming)', () => {
    const metadata = {
      pendingTalentNames: ['render_html'],
    };
    const {getByTestId, getByText} = render(
      <TalentSurface metadata={metadata} />,
    );
    // RenderHtmlTalentUI has renderPending, so talent-specific pending is used
    expect(getByTestId('talent-call-pending')).toBeTruthy();
    expect(getByText('Generating preview…')).toBeTruthy();
  });

  it('renders all talentCalls when multiple are present', () => {
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
        call_2: {
          type: 'html',
          html: '<p>second</p>',
          title: 'Second',
          summary: 'Rendered HTML preview: "Second"',
        },
      },
    };
    const {getByText, getAllByTestId} = render(
      <TalentSurface metadata={metadata} />,
    );
    expect(getAllByTestId('html-preview-bubble')).toHaveLength(2);
    expect(getByText('First')).toBeTruthy();
    expect(getByText('Second')).toBeTruthy();
    expect(getByText('<p>first</p>')).toBeTruthy();
    expect(getByText('<p>second</p>')).toBeTruthy();
  });

  it('renders nothing when talentCalls is an empty array', () => {
    const metadata = {
      talentCalls: [],
      talentResults: {},
    };
    const {queryByTestId} = render(<TalentSurface metadata={metadata} />);
    expect(queryByTestId('html-preview-bubble')).toBeNull();
    expect(queryByTestId('talent-call-pending')).toBeNull();
  });

  it('renders generic pending skeleton when talentCalls is empty and pendingTalentNames has unknown talent', () => {
    const metadata = {
      talentCalls: [],
      pendingTalentNames: ['unknown'],
    };
    const {queryByTestId, getByText} = render(
      <TalentSurface metadata={metadata} />,
    );
    // Empty talentCalls falls through to pendingTalentNames phase;
    // 'unknown' has no registered UI, so generic fallback renders.
    expect(queryByTestId('talent-call-pending')).toBeTruthy();
    expect(getByText('Generating preview…')).toBeTruthy();
  });

  it('renders nothing when talentCalls reference an unknown talent name', () => {
    const metadata = {
      talentCalls: [{function: {name: 'nonexistent_talent'}, id: 'call_1'}],
    };
    const {queryByTestId, queryByText} = render(
      <TalentSurface metadata={metadata} />,
    );
    expect(queryByTestId('html-preview-bubble')).toBeNull();
    expect(queryByTestId('talent-call-pending')).toBeNull();
    expect(queryByText('Generating preview…')).toBeNull();
  });

  it('renders HtmlPreviewBubble with default title when title is absent in result', () => {
    const metadata = {
      talentCalls: [{function: {name: 'render_html'}, id: 'call_1'}],
      talentResults: {
        call_1: {
          type: 'html',
          html: '<p>no title</p>',
          summary: 'Rendered HTML preview: "Untitled"',
        },
      },
    };
    const {getByTestId, getByText} = render(
      <TalentSurface metadata={metadata} />,
    );
    expect(getByTestId('html-preview-bubble')).toBeTruthy();
    // Mock HtmlPreviewBubble shows 'Preview' as default when title is undefined
    expect(getByText('Preview')).toBeTruthy();
  });

  it('looks up results by call ID, not talent name', () => {
    // Two render_html calls — results keyed by unique call IDs
    const metadata = {
      talentCalls: [
        {function: {name: 'render_html'}, id: 'call_A'},
        {function: {name: 'render_html'}, id: 'call_B'},
      ],
      talentResults: {
        call_A: {
          type: 'html',
          html: '<p>A</p>',
          title: 'Result A',
          summary: 'A',
        },
        call_B: {
          type: 'html',
          html: '<p>B</p>',
          title: 'Result B',
          summary: 'B',
        },
      },
    };
    const {getByText} = render(<TalentSurface metadata={metadata} />);
    expect(getByText('Result A')).toBeTruthy();
    expect(getByText('Result B')).toBeTruthy();
  });
});

describe('TalentSurface — UI rendering pipeline (extensibility)', () => {
  beforeEach(() => {
    talentUIRegistry.reset();
  });

  afterEach(() => {
    talentUIRegistry.reset();
  });

  it('renders a runtime-registered TalentUI via TalentSurface', () => {
    const testEchoUI: TalentUI = {
      name: 'test_echo',
      renderResult(result: TalentResult) {
        if (result.type !== 'text') {
          return null;
        }
        return <Text testID="echo-output">echo: {result.summary}</Text>;
      },
    };

    talentUIRegistry.register(testEchoUI);

    const metadata = {
      talentCalls: [{function: {name: 'test_echo'}, id: 'call_1'}],
      talentResults: {
        call_1: {type: 'text', summary: 'hello'},
      },
    };

    const {getByTestId, getByText} = render(
      <TalentSurface metadata={metadata} />,
    );
    expect(getByTestId('echo-output')).toBeTruthy();
    expect(getByText('echo: hello')).toBeTruthy();
  });

  it('renders runtime-registered TalentUI renderPending when pendingTalentNames present', () => {
    const testPendingUI: TalentUI = {
      name: 'test_pending',
      renderPending() {
        return <Text testID="custom-pending">Loading test_pending...</Text>;
      },
    };

    talentUIRegistry.register(testPendingUI);

    const metadata = {
      talentCalls: [{function: {name: 'test_pending'}, id: 'call_1'}],
      pendingTalentNames: ['test_pending'],
    };

    const {getByTestId, getByText} = render(
      <TalentSurface metadata={metadata} />,
    );
    expect(getByTestId('custom-pending')).toBeTruthy();
    expect(getByText('Loading test_pending...')).toBeTruthy();
  });
});
