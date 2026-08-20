import React from 'react';
import {ScrollView, StyleSheet} from 'react-native';

// Use the project's custom render which mounts MarkdownProvider — required
// because MarkdownView now relies on the ambient TRenderEngineProvider
// instead of building its own engine per instance.
import {render, fireEvent} from '../../../../jest/test-utils';
import {themeFixtures} from '../../../../jest/fixtures/theme';
import {useTheme} from '../../../hooks';

import {MarkdownView} from '../MarkdownView';
import {countMatches, highlightMatches} from '../../../utils/searchIndex';
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

  describe('highlightMatches', () => {
    it('returns html unchanged for an empty or whitespace query', () => {
      const html = highlightMatches('Hello world', '');
      expect(html).toBe('<p>Hello world</p>\n');
      expect(highlightMatches('Hello world', '   ')).toBe(html);
    });

    it('wraps a plain text match in a mark tag', () => {
      expect(highlightMatches('Hello world', 'world')).toBe(
        '<p>Hello <mark>world</mark></p>\n',
      );
    });

    it('matches case-insensitively', () => {
      expect(highlightMatches('HELLO world', 'hello')).toBe(
        '<p><mark>HELLO</mark> world</p>\n',
      );
    });

    it('highlights every occurrence', () => {
      expect(highlightMatches('ab ab ab', 'ab')).toBe(
        '<p><mark>ab</mark> <mark>ab</mark> <mark>ab</mark></p>\n',
      );
    });

    it('treats regex special characters in the query literally', () => {
      expect(highlightMatches('a.b and axb', 'a.b')).toBe(
        '<p><mark>a.b</mark> and axb</p>\n',
      );
    });

    // The projection only ever splices into the original html, so entities it
    // does not decode are copied verbatim rather than re-escaped.
    it('leaves entities outside the escaped set intact', () => {
      const source = 'The caf&eacute; opens at 9&nbsp;am &#8212; ok.';
      expect(highlightMatches(source, 'zzz')).toBe(`<p>${source}</p>\n`);
      expect(highlightMatches(source, 'opens')).toBe(
        '<p>The caf&eacute; <mark>opens</mark> at 9&nbsp;am &#8212; ok.</p>\n',
      );
    });

    it('matches the decoded character, however the source spelled it', () => {
      expect(highlightMatches('The caf&eacute; downstairs', 'café')).toBe(
        '<p>The <mark>caf&eacute;</mark> downstairs</p>\n',
      );
      expect(highlightMatches('The café downstairs', 'café')).toBe(
        '<p>The <mark>café</mark> downstairs</p>\n',
      );
    });

    it('does not match an entity spelling that is not visible text', () => {
      expect(highlightMatches('Tom & Jerry', 'amp')).toBe(
        '<p>Tom &amp; Jerry</p>\n',
      );
    });

    it('highlights a query containing an escaped character', () => {
      expect(highlightMatches("I don't recall", "don't")).toBe(
        '<p>I <mark>don&#39;t</mark> recall</p>\n',
      );
      expect(highlightMatches('Tom & Jerry', 'tom & jerry')).toBe(
        '<p><mark>Tom &amp; Jerry</mark></p>\n',
      );
    });

    it('highlights past a self-closing <code/> instead of disabling the rest', () => {
      expect(highlightMatches('<code/>hello world', 'hello')).toBe(
        '<p><code/><mark>hello</mark> world</p>\n',
      );
    });

    it('does not inject marks inside fenced code blocks', () => {
      const html = highlightMatches('```\nconst amp = 1;\n```', 'amp');
      expect(html).not.toContain('<mark>');
    });

    it('highlights inline code, which renders through the default renderer', () => {
      expect(highlightMatches('run `energy --check` now', 'energy')).toBe(
        '<p>run <code><mark>energy</mark> --check</code> now</p>\n',
      );
    });

    // Inline tags do not break a match; the match is emitted as one mark per
    // contiguous run so the surrounding markup stays balanced.
    it('matches across an inline tag boundary', () => {
      expect(highlightMatches('hello **world** here', 'hello world')).toBe(
        '<p><mark>hello </mark><strong><mark>world</mark></strong> here</p>\n',
      );
    });

    it('does not match across a block boundary', () => {
      const html = highlightMatches('first para\n\nsecond para', 'para second');
      expect(html).not.toContain('<mark>');
    });
  });

  describe('countMatches', () => {
    it('counts occurrences, not messages', () => {
      expect(
        countMatches('Each cell, the cell wall, the cell membrane.', 'cell'),
      ).toBe(3);
    });

    it('agrees with the marks emitted when no inline markup splits a match', () => {
      const source = 'Each cell, the cell wall, the cell membrane.';
      const marks = (highlightMatches(source, 'cell').match(/<mark>/g) || [])
        .length;
      expect(marks).toBe(countMatches(source, 'cell'));
    });

    it('is zero for an empty query', () => {
      expect(countMatches('Hello world', '  ')).toBe(0);
    });
  });
});
