import React from 'react';
import {Linking} from 'react-native';

import {render} from '../../../../jest/test-utils';

import {MathParagraphView} from '../MathParagraphView';

describe('MathParagraphView', () => {
  it('renders prose and inline math in one document', () => {
    const {getByTestId} = render(
      <MathParagraphView raw="The value is $x^2$." maxWidth={300} />,
    );

    const webView = getByTestId('latex-paragraph-webview');
    const html = webView.props.source.html as string;
    expect(html).toContain('The value is');
    expect(html).toContain('katex');
    // Punctuation stays attached to the formula, not orphaned.
    expect(html).toContain('</span>.');
    expect(webView.props.source.baseUrl).toBe('about:blank');
  });

  it('keeps markdown formatting around math', () => {
    const {getByTestId} = render(
      <MathParagraphView
        raw="See **bold** and [link](https://example.com) with $x$."
        maxWidth={300}
      />,
    );

    const html = getByTestId('latex-paragraph-webview').props.source
      .html as string;
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('href="https://example.com"');
  });

  it('shows invalid formulas as code inside the paragraph', () => {
    const {getByTestId} = render(
      <MathParagraphView raw="Bad $\\invalidcommand{{{$ here" maxWidth={300} />,
    );

    const html = getByTestId('latex-paragraph-webview').props.source
      .html as string;
    expect(html).toContain('<code>');
    expect(html).toContain('invalidcommand');
  });

  it('opens http links externally and blocks the WebView navigation', () => {
    const openSpy = jest
      .spyOn(Linking, 'openURL')
      .mockResolvedValue(true as unknown as void);
    try {
      const {getByTestId} = render(
        <MathParagraphView raw="See $x$." maxWidth={300} />,
      );

      const gate = getByTestId('latex-paragraph-webview').props
        .onShouldStartLoadWithRequest;
      expect(gate({url: 'about:blank'})).toBe(true);
      expect(gate({url: 'https://example.com/a'})).toBe(false);
      expect(openSpy).toHaveBeenCalledWith('https://example.com/a');
      // The javascript: string below is the attack payload under test —
      // asserting the gate rejects it, not executing it.
      // eslint-disable-next-line no-script-url
      expect(gate({url: 'javascript:alert(1)'})).toBe(false);
    } finally {
      openSpy.mockRestore();
    }
  });

  it('falls back to raw text without math', () => {
    const {getByTestId, queryByTestId} = render(
      <MathParagraphView raw="Just $5 and $10." maxWidth={300} />,
    );

    expect(queryByTestId('latex-paragraph-webview')).toBeNull();
    expect(getByTestId('latex-paragraph-fallback')).toBeTruthy();
  });
});
