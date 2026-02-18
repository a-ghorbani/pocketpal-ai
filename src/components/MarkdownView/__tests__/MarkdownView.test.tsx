import React from 'react';
import {ScrollView} from 'react-native';

import {render, fireEvent} from '@testing-library/react-native';

import {MarkdownView} from '../MarkdownView';

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
});
