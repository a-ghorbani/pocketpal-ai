import React from 'react';

import {render} from '../../../../jest/test-utils';

import {LatexBlock} from '../LatexBlock';

describe('LatexBlock', () => {
  it('renders block math inside a locked-down WebView', () => {
    const {getByTestId} = render(<LatexBlock tex="x^2 + 1" maxWidth={300} />);

    const webView = getByTestId('latex-math-block-webview');
    expect(webView).toBeTruthy();
    // Pre-rendered KaTeX HTML, pinned to about:blank (offline, no network).
    // Note: the MathML namespace string contains 'http' but no remote
    // resources are referenced — assert on loadable attributes instead.
    expect(webView.props.source.html).toContain('katex');
    expect(webView.props.source.html).not.toMatch(/ (src|href)="http/);
    expect(webView.props.source.baseUrl).toBe('about:blank');
    expect(webView.props.originWhitelist).toEqual(['about:blank']);
  });

  it('blocks navigation away from about:blank', () => {
    const {getByTestId} = render(<LatexBlock tex="x" maxWidth={300} />);

    const webView = getByTestId('latex-math-block-webview');
    const gate = webView.props.onShouldStartLoadWithRequest;
    expect(gate({url: 'about:blank'})).toBe(true);
    expect(gate({url: 'https://evil.example/x'})).toBe(false);
  });

  it('falls back to raw text when KaTeX cannot render', () => {
    const {getByTestId, queryByTestId} = render(
      <LatexBlock tex="\\invalidcommand{{{[" maxWidth={300} />,
    );

    expect(queryByTestId('latex-math-block-webview')).toBeNull();
    const fallback = getByTestId('latex-block-fallback');
    expect(fallback).toBeTruthy();
  });

  it('exposes the raw TeX for assistive tech', () => {
    const {getByTestId} = render(<LatexBlock tex={'\\alpha'} maxWidth={300} />);

    expect(
      getByTestId('latex-math-block-webview').props.accessibilityLabel,
    ).toBe('\\alpha');
  });
});
