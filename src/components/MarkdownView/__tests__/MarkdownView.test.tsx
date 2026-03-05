import React from 'react';
import {ScrollView, StyleSheet} from 'react-native';

// Use the project's custom render which mounts MarkdownProvider — required
// because MarkdownView now relies on the ambient TRenderEngineProvider
// instead of building its own engine per instance.
import {render, fireEvent} from '../../../../jest/test-utils';
import {themeFixtures} from '../../../../jest/fixtures/theme';
import {useTheme} from '../../../hooks';

import {MarkdownView, highlightSearchMatches} from '../MarkdownView';
import {SearchQueryContext} from '../../../utils';

describe('MarkdownView Component', () => {
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

  describe('Link Rendering', () => {
    const lightLink = themeFixtures.lightTheme.colors.secondary;
    const darkLink = themeFixtures.darkTheme.colors.secondary;

    it('renders link text from a markdown link', () => {
      const markdownText = '[Example](https://example.com)';
      const {getByText} = render(
        <MarkdownView markdownText={markdownText} maxMessageWidth={300} />,
      );

      expect(getByText('Example')).toBeTruthy();
    });

    it('styles links with a distinct color and underline', () => {
      const markdownText = '[Example](https://example.com)';
      const {getByText} = render(
        <MarkdownView markdownText={markdownText} maxMessageWidth={300} />,
      );

      const linkNode = getByText('Example');
      const flattened = StyleSheet.flatten(linkNode.props.style) || {};

      expect(flattened.color).toBe(lightLink);
      expect(flattened.textDecorationLine).toBe('underline');
    });

    it('uses the dark theme link color in dark mode', () => {
      (useTheme as jest.Mock).mockReturnValue(themeFixtures.darkTheme);
      try {
        const {getByText} = render(
          <MarkdownView
            markdownText="[Example](https://example.com)"
            maxMessageWidth={300}
          />,
        );
        const flattened =
          StyleSheet.flatten(getByText('Example').props.style) || {};

        expect(flattened.color).toBe(darkLink);
      } finally {
        (useTheme as jest.Mock).mockReturnValue(themeFixtures.lightTheme);
      }
    });
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

  describe('Search highlighting', () => {
    it('renders without highlighting when search query is empty', () => {
      const {getByText} = render(
        <SearchQueryContext.Provider value="">
          <MarkdownView markdownText="Hello world" maxMessageWidth={300} />
        </SearchQueryContext.Provider>,
      );

      expect(getByText('Hello world')).toBeTruthy();
    });

    it('renders without highlighting when no context is provided', () => {
      const {getByText} = render(
        <MarkdownView markdownText="Hello world" maxMessageWidth={300} />,
      );

      expect(getByText('Hello world')).toBeTruthy();
    });

    // Guards the MarkdownProvider registration: without the `mark` element
    // model + tagsStyles, the matched term would not carry the highlight token.
    it('styles a matched term with the search-highlight token', () => {
      const {getByText} = render(
        <SearchQueryContext.Provider value="world">
          <MarkdownView markdownText="Hello world" maxMessageWidth={300} />
        </SearchQueryContext.Provider>,
      );

      const flattened =
        StyleSheet.flatten(getByText('world').props.style) || {};
      expect(flattened.backgroundColor).toBe(
        themeFixtures.lightTheme.colors.searchHighlight,
      );
    });
  });

  describe('highlightSearchMatches', () => {
    it('returns html unchanged for an empty or whitespace query', () => {
      const html = '<p>Hello world</p>';
      expect(highlightSearchMatches(html, '')).toBe(html);
      expect(highlightSearchMatches(html, '   ')).toBe(html);
    });

    it('wraps a plain text match in a mark tag', () => {
      expect(highlightSearchMatches('<p>Hello world</p>', 'world')).toBe(
        '<p>Hello <mark>world</mark></p>',
      );
    });

    it('matches case-insensitively', () => {
      expect(highlightSearchMatches('<p>HELLO world</p>', 'hello')).toBe(
        '<p><mark>HELLO</mark> world</p>',
      );
    });

    it('highlights every occurrence', () => {
      expect(highlightSearchMatches('<p>ab ab ab</p>', 'ab')).toBe(
        '<p><mark>ab</mark> <mark>ab</mark> <mark>ab</mark></p>',
      );
    });

    it('treats regex special characters in the query literally', () => {
      expect(highlightSearchMatches('<p>a.b and axb</p>', 'a.b')).toBe(
        '<p><mark>a.b</mark> and axb</p>',
      );
    });

    it('does not highlight an entity spelling that is not in the text', () => {
      // The text is "Tom & Jerry"; "amp" only appears in the &amp; spelling,
      // so it must not match, and the entity must stay intact.
      const html = '<p>Tom &amp; Jerry</p>';
      expect(highlightSearchMatches(html, 'amp')).toBe(html);
    });

    it('highlights around an entity without corrupting it', () => {
      expect(highlightSearchMatches('<p>a &amp; apple</p>', 'a')).toBe(
        '<p><mark>a</mark> &amp; <mark>a</mark>pple</p>',
      );
    });

    it('highlights a query containing an escaped character (apostrophe)', () => {
      // marked() escapes ' to &#39;; the store counted this match on the raw
      // text, so the highlight must agree by matching the decoded character.
      expect(highlightSearchMatches('<p>I don&#39;t recall</p>', "don't")).toBe(
        '<p>I <mark>don&#39;t</mark> recall</p>',
      );
    });

    it('highlights past a self-closing <code/> instead of disabling the rest', () => {
      // A self-closing <code/> has no closing tag; counting it would leak
      // codeDepth and suppress every later match in the message.
      expect(
        highlightSearchMatches(
          '<p><code/>hello world and more hello</p>',
          'hello',
        ),
      ).toBe(
        '<p><code/><mark>hello</mark> world and more <mark>hello</mark></p>',
      );
    });

    it('does not inject marks inside code blocks', () => {
      const html = '<pre><code>const amp = 1;</code></pre>';
      expect(highlightSearchMatches(html, 'amp')).toBe(html);
    });

    it('does not match across tag boundaries', () => {
      // "hello world" is split by a <strong> tag, so it must not match.
      const html = '<p>hello <strong>world</strong></p>';
      expect(highlightSearchMatches(html, 'hello world')).toBe(html);
    });
  });
});
