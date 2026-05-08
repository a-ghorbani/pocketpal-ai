import React from 'react';
import {ScrollView} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';

import {render, fireEvent} from '@testing-library/react-native';

import {MarkdownView} from '../MarkdownView';

const treeHasStyleValue = (node: any, key: string, value: unknown): boolean => {
  if (Array.isArray(node)) {
    return node.some(child => treeHasStyleValue(child, key, value));
  }

  if (!node || typeof node !== 'object') {
    return false;
  }

  const styles = Array.isArray(node.props?.style)
    ? node.props.style
    : [node.props?.style];

  if (styles.some((style: any) => style && style[key] === value)) {
    return true;
  }

  return (node.children || []).some((child: any) =>
    treeHasStyleValue(child, key, value),
  );
};

describe('MarkdownView Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders markdown content correctly', () => {
    const markdownText = 'Hello **World**';
    const {getByText} = render(
      <MarkdownView markdownText={markdownText} maxMessageWidth={300} />,
    );

    expect(getByText('Hello World')).toBeTruthy();
  });

  it('handles different content widths properly', () => {
    const markdownText = '# Test Markdown';
    const {getByTestId, rerender} = render(
      <MarkdownView markdownText={markdownText} maxMessageWidth={300} />,
    );

    // Simulate a layout change
    fireEvent(getByTestId('markdown-content'), 'layout', {
      nativeEvent: {
        layout: {width: 200, height: 100},
      },
    });

    rerender(
      <MarkdownView markdownText={markdownText} maxMessageWidth={200} />,
    );

    const element = getByTestId('markdown-content');

    // Check if style is an array and extract maxWidth from the correct location
    const style = element.props.style;
    let maxWidth: number | undefined;

    if (Array.isArray(style)) {
      // Find maxWidth in the style array
      for (const styleItem of style) {
        if (
          styleItem &&
          typeof styleItem === 'object' &&
          'maxWidth' in styleItem
        ) {
          maxWidth = styleItem.maxWidth;
          break;
        }
      }
    } else if (style && typeof style === 'object' && 'maxWidth' in style) {
      maxWidth = style.maxWidth;
    }

    expect(maxWidth).toBe(200);
  });

  it('does not render main content when markdownText is empty', () => {
    const {getByTestId, queryByText} = render(
      <MarkdownView markdownText="" maxMessageWidth={300} />,
    );

    // Container should still exist
    expect(getByTestId('markdown-content')).toBeTruthy();
    // But no text content should be rendered
    expect(queryByText(/.+/)).toBeNull();
  });

  it('does not render main content when markdownText is whitespace only', () => {
    const {getByTestId, queryByText} = render(
      <MarkdownView markdownText="   " maxMessageWidth={300} />,
    );

    expect(getByTestId('markdown-content')).toBeTruthy();
    expect(queryByText(/.+/)).toBeNull();
  });

  it('renders with selectable text when selectable prop is true', () => {
    const markdownText = 'Selectable text';
    const {getByText} = render(
      <MarkdownView
        markdownText={markdownText}
        maxMessageWidth={300}
        selectable={true}
      />,
    );

    expect(getByText('Selectable text')).toBeTruthy();
  });

  it('renders code blocks with syntax highlighting', () => {
    const markdownText = '```javascript\nconst x = 1;\n```';
    const {getByText} = render(
      <MarkdownView markdownText={markdownText} maxMessageWidth={300} />,
    );

    // CodeHighlighter mock renders content as Text
    expect(getByText('const x = 1;')).toBeTruthy();
  });

  it('renders inline code without code block styling', () => {
    const markdownText = 'Use `console.log` for debugging';
    const {getByText} = render(
      <MarkdownView markdownText={markdownText} maxMessageWidth={300} />,
    );

    expect(getByText(/console\.log/)).toBeTruthy();
  });

  describe('Table Rendering', () => {
    it('renders markdown table with headers and data cells', () => {
      const markdownText =
        '| Name | Value |\n|------|-------|\n| A | 1 |\n| B | 2 |';
      const {getByText} = render(
        <MarkdownView markdownText={markdownText} maxMessageWidth={300} />,
      );

      // Verify header cells are rendered
      expect(getByText('Name')).toBeTruthy();
      expect(getByText('Value')).toBeTruthy();

      // Verify data cells are rendered
      expect(getByText('A')).toBeTruthy();
      expect(getByText('1')).toBeTruthy();
      expect(getByText('B')).toBeTruthy();
      expect(getByText('2')).toBeTruthy();
    });

    it('renders table alongside other markdown content', () => {
      const markdownText =
        '# Title\n\nSome text\n\n| Col1 | Col2 |\n|------|------|\n| X | Y |\n\nMore text';
      const {getByText} = render(
        <MarkdownView markdownText={markdownText} maxMessageWidth={300} />,
      );

      expect(getByText('Title')).toBeTruthy();
      expect(getByText('Some text')).toBeTruthy();
      expect(getByText('Col1')).toBeTruthy();
      expect(getByText('X')).toBeTruthy();
      expect(getByText('More text')).toBeTruthy();
    });

    it('renders a table with empty cells', () => {
      const markdownText = '| A | B |\n|---|---|\n|   | 1 |\n| 2 |   |';
      const {getByText} = render(
        <MarkdownView markdownText={markdownText} maxMessageWidth={300} />,
      );

      expect(getByText('A')).toBeTruthy();
      expect(getByText('B')).toBeTruthy();
      expect(getByText('1')).toBeTruthy();
      expect(getByText('2')).toBeTruthy();
    });

    it('wraps table in a horizontal ScrollView', () => {
      const markdownText = '| A | B |\n|---|---|\n| 1 | 2 |';
      const {UNSAFE_getByType} = render(
        <MarkdownView markdownText={markdownText} maxMessageWidth={300} />,
      );

      expect(UNSAFE_getByType(ScrollView)).toBeTruthy();
    });

    it('renders a table with many columns', () => {
      const markdownText =
        '| C1 | C2 | C3 | C4 | C5 |\n|---|---|---|---|---|\n| a | b | c | d | e |';
      const {getByText} = render(
        <MarkdownView markdownText={markdownText} maxMessageWidth={300} />,
      );

      expect(getByText('C1')).toBeTruthy();
      expect(getByText('C5')).toBeTruthy();
      expect(getByText('a')).toBeTruthy();
      expect(getByText('e')).toBeTruthy();
    });

    it('renders a table with a single column', () => {
      const markdownText = '| Item |\n|------|\n| One |\n| Two |';
      const {getByText} = render(
        <MarkdownView markdownText={markdownText} maxMessageWidth={300} />,
      );

      expect(getByText('Item')).toBeTruthy();
      expect(getByText('One')).toBeTruthy();
      expect(getByText('Two')).toBeTruthy();
    });

    it('renders multiple tables in one message', () => {
      const markdownText =
        '| A | B |\n|---|---|\n| 1 | 2 |\n\nSome text\n\n| X | Y |\n|---|---|\n| 3 | 4 |';
      const {getByText, UNSAFE_getAllByType} = render(
        <MarkdownView markdownText={markdownText} maxMessageWidth={300} />,
      );

      expect(getByText('A')).toBeTruthy();
      expect(getByText('X')).toBeTruthy();
      expect(getByText('Some text')).toBeTruthy();

      // Both tables should be wrapped in ScrollViews
      const scrollViews = UNSAFE_getAllByType(ScrollView);
      expect(scrollViews.length).toBeGreaterThanOrEqual(2);
    });

    it('renders a table with many rows', () => {
      const rows = Array.from(
        {length: 10},
        (_, i) => `| item${i} | val${i} |`,
      ).join('\n');
      const markdownText = `| Name | Value |\n|------|-------|\n${rows}`;
      const {getByText} = render(
        <MarkdownView markdownText={markdownText} maxMessageWidth={300} />,
      );

      expect(getByText('item0')).toBeTruthy();
      expect(getByText('item9')).toBeTruthy();
      expect(getByText('val0')).toBeTruthy();
      expect(getByText('val9')).toBeTruthy();
    });

    it('renders a table with inline bold and italic formatting in cells', () => {
      const markdownText =
        '| Feature | Status |\n|---------|--------|\n| **Bold** | *Italic* |';
      const {getByText} = render(
        <MarkdownView markdownText={markdownText} maxMessageWidth={300} />,
      );

      expect(getByText('Feature')).toBeTruthy();
      expect(getByText('Status')).toBeTruthy();
      expect(getByText('Bold')).toBeTruthy();
      expect(getByText('Italic')).toBeTruthy();
    });

    it('uses compact table styles when requested by prop', () => {
      const markdownText = '| A | B |\n|---|---|\n| 1 | 2 |';
      const {toJSON} = render(
        <MarkdownView
          markdownText={markdownText}
          maxMessageWidth={300}
          useCompactTables
        />,
      );

      expect(treeHasStyleValue(toJSON(), 'minWidth', 84)).toBe(true);
      expect(treeHasStyleValue(toJSON(), 'padding', 4)).toBe(true);
    });
  });

  describe('LaTeX rendering', () => {
    it('renders inline math with the local KaTeX WebView renderer', () => {
      const {getByTestId} = render(
        <MarkdownView
          markdownText="Energy is $E=mc^2$."
          maxMessageWidth={300}
        />,
      );

      const webView = getByTestId('katex-math-inline-webview');

      expect(webView.props.source.html).toContain('class="katex"');
      expect(webView.props.source.html).toContain('E');
      expect(webView.props.domStorageEnabled).toBe(false);
      expect(webView.props.allowFileAccess).toBe(false);
    });

    it('copies inline math TeX on long press', () => {
      const {getByLabelText} = render(
        <MarkdownView
          markdownText="Energy is $E=mc^2$."
          maxMessageWidth={300}
        />,
      );

      fireEvent(getByLabelText('Copy LaTeX'), 'longPress');

      expect(Clipboard.setString).toHaveBeenCalledWith('E=mc^2');
    });

    it('renders block math inside a horizontal scroll container', () => {
      const {getByTestId, UNSAFE_getAllByType} = render(
        <MarkdownView
          markdownText={'$$\n\\frac{dx}{dt}=\\alpha x + \\beta\n$$'}
          maxMessageWidth={240}
        />,
      );

      const webView = getByTestId('katex-math-block-webview');
      const style = Array.isArray(webView.props.style)
        ? webView.props.style
        : [webView.props.style];

      expect(webView.props.source.html).toContain('class="katex-display"');
      expect(style.some((item: any) => item?.width === 240)).toBe(true);
      expect(
        UNSAFE_getAllByType(ScrollView).some(node => node.props.horizontal),
      ).toBe(true);
    });

    it('shows the raw styled fallback when LaTeX rendering is disabled', () => {
      const {getByText, queryByTestId} = render(
        <MarkdownView
          markdownText="Energy is $E=mc^2$."
          maxMessageWidth={300}
          renderLatex={false}
        />,
      );

      expect(queryByTestId('katex-math-inline-webview')).toBeNull();
      expect(getByText(/E=mc\^2/)).toBeTruthy();
    });

    it('falls back to raw TeX for malformed formulas', () => {
      const {getByText, queryByTestId} = render(
        <MarkdownView markdownText="Broken $\\frac{$" maxMessageWidth={300} />,
      );

      expect(queryByTestId('katex-math-inline-webview')).toBeNull();
      expect(getByText(/frac/)).toBeTruthy();
    });

    it('recovers from fallback when a later formula is valid', () => {
      const {queryByTestId, rerender} = render(
        <MarkdownView markdownText="Broken $\\frac{$" maxMessageWidth={300} />,
      );

      expect(queryByTestId('katex-math-inline-webview')).toBeNull();

      rerender(
        <MarkdownView markdownText="Valid $E=mc^2$" maxMessageWidth={300} />,
      );

      expect(queryByTestId('katex-math-inline-webview')).toBeTruthy();
    });
  });

  describe('React.memo behavior', () => {
    it('does not re-render when props are unchanged', () => {
      const markdownText = 'Hello';
      const {getByText, rerender} = render(
        <MarkdownView markdownText={markdownText} maxMessageWidth={300} />,
      );

      expect(getByText('Hello')).toBeTruthy();

      // Re-render with same props -- React.memo should prevent re-render
      rerender(
        <MarkdownView markdownText={markdownText} maxMessageWidth={300} />,
      );

      expect(getByText('Hello')).toBeTruthy();
    });

    it('re-renders when markdownText changes', () => {
      const {getByText, rerender} = render(
        <MarkdownView markdownText="First" maxMessageWidth={300} />,
      );

      expect(getByText('First')).toBeTruthy();

      rerender(<MarkdownView markdownText="Second" maxMessageWidth={300} />);

      expect(getByText('Second')).toBeTruthy();
    });
  });
});
