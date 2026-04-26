import React from 'react';

import {render} from '../../../../jest/test-utils';
import {RenderHtmlTalentUI} from '../RenderHtmlTalentUI';

jest.mock('../../../components/HtmlPreviewBubble', () => ({
  HtmlPreviewBubble: ({html, title}: {html: string; title?: string}) => {
    const {View, Text: RNText} = require('react-native');
    return (
      <View testID="html-preview-bubble">
        <RNText testID="preview-title">{title ?? 'Untitled'}</RNText>
        <RNText testID="preview-html">{html}</RNText>
      </View>
    );
  },
}));

describe('RenderHtmlTalentUI', () => {
  let ui: RenderHtmlTalentUI;

  beforeEach(() => {
    ui = new RenderHtmlTalentUI();
  });

  it('has name "render_html"', () => {
    expect(ui.name).toBe('render_html');
  });

  describe('renderResult', () => {
    it('returns HtmlPreviewBubble with html and title from TalentResult', () => {
      const result = {
        type: 'html' as const,
        html: '<h1>Hello</h1>',
        title: 'Test Title',
        summary: 'Rendered HTML preview: "Test Title"',
      };
      const node = ui.renderResult(result);
      const {getByTestId, getByText} = render(<>{node}</>);
      expect(getByTestId('html-preview-bubble')).toBeTruthy();
      expect(getByText('Test Title')).toBeTruthy();
      expect(getByText('<h1>Hello</h1>')).toBeTruthy();
    });

    it('returns null when result type is not html', () => {
      const result = {
        type: 'text' as const,
        summary: 'some text result',
      };
      const node = ui.renderResult(result);
      expect(node).toBeNull();
    });

    it('returns null when html is empty', () => {
      const result = {
        type: 'html' as const,
        html: '',
        summary: 'empty',
      };
      const node = ui.renderResult(result);
      expect(node).toBeNull();
    });

    it('renders without title when title is absent', () => {
      const result = {
        type: 'html' as const,
        html: '<p>content</p>',
        summary: 'Rendered HTML preview: "Untitled"',
      };
      const node = ui.renderResult(result);
      const {getByTestId, getByText} = render(<>{node}</>);
      expect(getByTestId('html-preview-bubble')).toBeTruthy();
      expect(getByText('Untitled')).toBeTruthy();
    });
  });

  describe('renderPending', () => {
    it('renders pending skeleton with correct testID and text', () => {
      const node = ui.renderPending();
      const {getByTestId, getByText} = render(<>{node}</>);
      expect(getByTestId('talent-call-pending')).toBeTruthy();
      expect(getByText('Generating preview…')).toBeTruthy();
    });
  });
});
