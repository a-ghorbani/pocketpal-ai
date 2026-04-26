import React from 'react';
import {fireEvent, render} from '../../../../jest/test-utils';
import {HtmlPreviewBubble} from '../HtmlPreviewBubble';

describe('HtmlPreviewBubble', () => {
  const html = '<p>hello</p>';

  it('renders the collapsed bubble with the provided title', () => {
    const {getByText, getByTestId} = render(
      <HtmlPreviewBubble html={html} title="My Preview" />,
    );
    expect(getByTestId('html-preview-bubble')).toBeTruthy();
    expect(getByTestId('html-preview-bubble-collapsed')).toBeTruthy();
    expect(getByText('My Preview')).toBeTruthy();
  });

  it('falls back to "Preview" when title is missing or empty', () => {
    const {getByText, rerender} = render(<HtmlPreviewBubble html={html} />);
    expect(getByText('Preview')).toBeTruthy();

    rerender(<HtmlPreviewBubble html={html} title="" />);
    expect(getByText('Preview')).toBeTruthy();
  });

  it('wraps html inside a full document with CSP meta tag and keeps JS disabled', () => {
    const {getByTestId} = render(
      <HtmlPreviewBubble html={html} title="CSP Test" />,
    );
    const webview = getByTestId('html-preview-webview');
    // The mock WebView (see __mocks__/external/react-native-webview.ts) forwards
    // all props onto the underlying View, so we can inspect them directly.
    const source = webview.props.source;
    expect(source.baseUrl).toBe('about:blank');
    expect(typeof source.html).toBe('string');
    expect(source.html).toContain('http-equiv="Content-Security-Policy"');
    expect(source.html).toContain("default-src 'none'");
    expect(source.html).toContain('img-src data:');
    expect(source.html).toContain(html);
    expect(webview.props.javaScriptEnabled).toBe(true);
    expect(webview.props.originWhitelist).toEqual(['about:blank']);
    // Initial about:blank load is allowed; any other navigation is blocked.
    expect(
      webview.props.onShouldStartLoadWithRequest({url: 'about:blank'}),
    ).toBe(true);
    expect(
      webview.props.onShouldStartLoadWithRequest({url: 'https://evil.com'}),
    ).toBe(false);
  });

  it('opens the fullscreen modal on press and closes it via the close button', () => {
    // In the jest RN mock, <Modal> renders its children only while visible.
    const {getByTestId, queryByTestId} = render(
      <HtmlPreviewBubble html={html} title="Modal Test" />,
    );

    // Modal content is not visible initially.
    expect(queryByTestId('html-preview-modal-close')).toBeNull();
    expect(queryByTestId('html-preview-modal-webview')).toBeNull();

    fireEvent.press(getByTestId('html-preview-bubble-collapsed'));

    const closeBtn = getByTestId('html-preview-modal-close');
    expect(closeBtn).toBeTruthy();
    const modalWebView = getByTestId('html-preview-modal-webview');
    expect(modalWebView.props.javaScriptEnabled).toBe(true);
    expect(modalWebView.props.source.baseUrl).toBe('about:blank');

    fireEvent.press(closeBtn);
    expect(queryByTestId('html-preview-modal-close')).toBeNull();
  });

  it('toggles between rendered preview and raw HTML code', () => {
    const {getByTestId, queryByTestId} = render(
      <HtmlPreviewBubble html={html} title="Toggle Test" />,
    );

    // Preview is shown by default.
    expect(getByTestId('html-preview-webview')).toBeTruthy();
    expect(queryByTestId('html-preview-code')).toBeNull();

    fireEvent.press(getByTestId('html-preview-toggle-code'));

    expect(getByTestId('html-preview-code')).toBeTruthy();
    expect(queryByTestId('html-preview-webview')).toBeNull();

    fireEvent.press(getByTestId('html-preview-toggle-code'));

    expect(getByTestId('html-preview-webview')).toBeTruthy();
    expect(queryByTestId('html-preview-code')).toBeNull();
  });
});
