import React from 'react';

import {render} from '../../../../jest/test-utils';

import {MAX_MATH_PER_MESSAGE} from '../../../utils/latex';
import {MarkdownView} from '../MarkdownView';

describe('MarkdownView LaTeX integration', () => {
  it('renders messages without math exactly as before', () => {
    const {getByText, queryByTestId} = render(
      <MarkdownView markdownText="Hello **World**" maxMessageWidth={300} />,
    );

    expect(getByText('Hello World')).toBeTruthy();
    expect(queryByTestId('latex-math-block-webview')).toBeNull();
    expect(queryByTestId('latex-math-inline-webview')).toBeNull();
  });

  it('renders block math between markdown chunks', () => {
    const {getByText, getByTestId} = render(
      <MarkdownView
        markdownText={'Solve this:\n\n$$x^2 + 1$$\n\nDone'}
        maxMessageWidth={300}
      />,
    );

    expect(getByText('Solve this:')).toBeTruthy();
    expect(getByText('Done')).toBeTruthy();
    expect(getByTestId('latex-math-block-webview')).toBeTruthy();
  });

  it('renders the #138 example equation', () => {
    const {getByTestId} = render(
      <MarkdownView
        markdownText={'$$\\frac{dx}{dt} = \\alpha x + \\beta$$'}
        maxMessageWidth={300}
      />,
    );

    expect(getByTestId('latex-math-block-webview')).toBeTruthy();
  });

  it('leaves streaming partial math as raw text (no WebView)', () => {
    const {queryByTestId, getByTestId} = render(
      <MarkdownView markdownText="Answer $$x^2" maxMessageWidth={300} />,
    );

    expect(queryByTestId('latex-math-block-webview')).toBeNull();
    expect(getByTestId('markdown-content')).toBeTruthy();
  });

  it('does not parse math inside code fences', () => {
    const {queryByTestId, getByText} = render(
      <MarkdownView
        markdownText={'```latex\n$$x^2$$\n```'}
        maxMessageWidth={300}
      />,
    );

    expect(queryByTestId('latex-math-block-webview')).toBeNull();
    expect(getByText('$$x^2$$')).toBeTruthy();
  });

  it('keeps markdown features working alongside math', () => {
    const {getByText, getByTestId} = render(
      <MarkdownView
        markdownText={'# Title\n\n$$a^2$$\n\n| A | B |\n|---|---|\n| 1 | 2 |'}
        maxMessageWidth={300}
      />,
    );

    expect(getByText('Title')).toBeTruthy();
    expect(getByText('1')).toBeTruthy();
    expect(getByTestId('latex-math-block-webview')).toBeTruthy();
  });

  it(`caps WebViews at ${MAX_MATH_PER_MESSAGE} and shows the rest as code`, () => {
    const formulas = Array.from({length: MAX_MATH_PER_MESSAGE + 1})
      .map((_, i) => `$$x_{${i}}$$`)
      .join('\n\n');
    const {queryAllByTestId, getByText} = render(
      <MarkdownView markdownText={formulas} maxMessageWidth={300} />,
    );

    expect(queryAllByTestId('latex-math-block-webview')).toHaveLength(
      MAX_MATH_PER_MESSAGE,
    );
    // The over-cap formula falls back to a visible code block, never lost.
    expect(getByText(`$$x_{${MAX_MATH_PER_MESSAGE}}$$`)).toBeTruthy();
  });

  it('renders the on-device screenshot response end to end', () => {
    // Transcribed from a real LFM2.5 answer (single-$ inline style plus
    // three $$ display blocks). 14 formulas, all under the cap: 9 inline
    // paragraphs + 3 display blocks mount WebViews, nothing falls back.
    const response = [
      'The quadratic formula is $x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$.',
      'An integral example: $\\int_{0}^{\\infty} e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}$.',
      'A matrix:',
      '$$\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}$$',
      "A derivative: $f'(x) = \\frac{d}{dx}(x^3 - 2x^2 + x) = 3x^2 - 4x + 1$.",
      'A partial differential equation: $\\frac{\\partial u}{\\partial t} = \\alpha \\nabla^2 u + f(u)$.',
      'A sum and product: $\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}$.',
      'The determinant of a $2 \\times 2$ matrix: $\\det(A) = ad - bc$.',
      'A dot product: $\\vec{a} \\cdot \\vec{b} = |a||b| \\cos\\theta$.',
      'A piecewise function:',
      '$$f(x) = \\begin{cases} x^2 & \\text{if } x < 0 \\\\ -x^2 & \\text{if } x \\geq 0 \\end{cases}$$',
      'A complex number: $z = a + bi$, where $i$ is the imaginary unit.',
      'A system of equations:',
      '$$\\begin{cases} x + y = 2 \\\\ 2x - y = 1 \\end{cases}$$',
      'A limit expression: $\\lim_{n \\to \\infty} \\frac{\\sum_{k=1}^n k}{n^2} = \\frac{1}{2}$.',
    ].join('\n\n');
    const {queryAllByTestId, queryByTestId, getByText, getByTestId} = render(
      <MarkdownView markdownText={response} maxMessageWidth={300} />,
    );

    expect(getByTestId('markdown-content')).toBeTruthy();
    // Pure-text paragraphs stay native.
    expect(getByText('A matrix:')).toBeTruthy();
    expect(getByText('A piecewise function:')).toBeTruthy();
    expect(getByText('A system of equations:')).toBeTruthy();
    // All three display blocks (matrix, piecewise, system) render.
    expect(queryAllByTestId('latex-math-block-webview')).toHaveLength(3);
    // All nine inline paragraphs render in-flow; standalone inline
    // WebViews are gone by design.
    const paras = queryAllByTestId('latex-paragraph-webview');
    expect(paras).toHaveLength(9);
    expect(queryByTestId('latex-math-inline-webview')).toBeNull();
    expect(queryByTestId('latex-block-fallback')).toBeNull();
    expect(queryByTestId('latex-paragraph-fallback')).toBeNull();
    // Sentence stays whole inside one document: prose, math, punctuation.
    const firstHtml = paras[0].props.source.html as string;
    expect(firstHtml).toContain('quadratic formula');
    expect(firstHtml).toContain('katex');
    expect(firstHtml).toContain('</span>.');
    const complexHtml = paras[7].props.source.html as string;
    expect(complexHtml).toContain('where');
    expect(complexHtml).toContain('imaginary unit');
  });

  it('keeps trailing sentence punctuation inside the math paragraph', () => {
    const {queryAllByTestId, queryByText} = render(
      <MarkdownView markdownText="The value is $x^2$." maxMessageWidth={300} />,
    );

    // One paragraph WebView — no orphan "." row underneath.
    expect(queryAllByTestId('latex-paragraph-webview')).toHaveLength(1);
    expect(queryByText('.')).toBeNull();
  });

  it('keeps fences native when math is nearby', () => {
    const {getByText, queryAllByTestId} = render(
      <MarkdownView
        markdownText={'```tex\n$$x$$\n```\n\nAnd $y$ here'}
        maxMessageWidth={300}
      />,
    );

    expect(getByText('$$x$$')).toBeTruthy();
    expect(queryAllByTestId('latex-paragraph-webview')).toHaveLength(1);
    expect(queryAllByTestId('latex-math-block-webview')).toHaveLength(0);
  });

  it('keeps tables native when math is nearby', () => {
    const {getByText, queryAllByTestId} = render(
      <MarkdownView
        markdownText={'| A | B |\n|---|---|\n| 1 | 2 |\n\nNote $x$ here'}
        maxMessageWidth={300}
      />,
    );

    expect(getByText('A')).toBeTruthy();
    expect(getByText('1')).toBeTruthy();
    expect(queryAllByTestId('latex-paragraph-webview')).toHaveLength(1);
  });

  it('deconstructs over-cap flows into native pieces', () => {
    const crowded = Array.from({length: MAX_MATH_PER_MESSAGE + 1})
      .map((_, i) => `$x_{${i}}$`)
      .join(' ');
    const {queryAllByTestId, queryByTestId, getByText} = render(
      <MarkdownView markdownText={crowded} maxMessageWidth={300} />,
    );

    // One paragraph over budget: no WebView, every formula as code.
    expect(queryAllByTestId('latex-paragraph-webview')).toHaveLength(0);
    expect(queryByTestId('latex-paragraph-fallback')).toBeNull();
    expect(getByText(`$x_{${MAX_MATH_PER_MESSAGE}}$`)).toBeTruthy();
  });
});
