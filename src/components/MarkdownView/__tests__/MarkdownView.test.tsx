import React from 'react';
import {Linking, StyleSheet} from 'react-native';

import {EnrichedMarkdownText} from 'react-native-enriched-markdown';

import {act, fireEvent, render} from '../../../../jest/test-utils';
import {themeFixtures} from '../../../../jest/fixtures/theme';
import {useTheme} from '../../../hooks';
import {l10n} from '../../../locales';
import {L10nContext} from '../../../utils';

import {MarkdownView} from '../MarkdownView';

const spy = EnrichedMarkdownText as unknown as jest.Mock;
const lastProps = () => spy.mock.calls[spy.mock.calls.length - 1][0];
const en = l10n.en.components.markdownView;

type RGBA = [number, number, number, number];

const rgba = (color: string): RGBA => {
  if (color.startsWith('#')) {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16));
    return [r, g, b, 1];
  }
  const [r, g, b, a = 1] = color.match(/[\d.]+/g)!.map(Number);
  return [r, g, b, a];
};

const over = ([r, g, b, a]: RGBA, [br, bg, bb]: RGBA): RGBA => [
  r * a + br * (1 - a),
  g * a + bg * (1 - a),
  b * a + bb * (1 - a),
  1,
];

const luminance = ([r, g, b]: RGBA) => {
  const [lr, lg, lb] = [r, g, b].map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
};

const contrast = (a: RGBA, b: RGBA) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('MarkdownView', () => {
  beforeEach(() => {
    spy.mockClear();
  });

  it('renders the text through the library with the chat configuration', () => {
    const {getByText} = render(
      <MarkdownView markdownText="Hello **World**" maxMessageWidth={300} />,
    );

    expect(getByText('Hello **World**')).toBeTruthy();
    expect(lastProps()).toEqual(
      expect.objectContaining({
        markdown: 'Hello **World**',
        flavor: 'github',
        md4cFlags: {latexMath: false, admonitions: false},
        enableTaskListItemToggle: false,
        enableLinkPreview: false,
      }),
    );
  });

  it('leaves dollar amounts to the text renderer', () => {
    render(
      <MarkdownView markdownText="It costs $5 or $10" maxMessageWidth={300} />,
    );

    expect(lastProps().md4cFlags.latexMath).toBe(false);
  });

  it('passes the en.json selection menu labels', () => {
    render(<MarkdownView markdownText="a" maxMessageWidth={300} />);

    expect(lastProps().selectionMenuConfig).toEqual({
      copy: {label: en.selectionMenu.copy},
      copyAsMarkdown: {label: en.selectionMenu.copyAsMarkdown},
      copyImageUrl: {
        label: en.selectionMenu.copyImageUrl,
        pluralLabels: {other: 'Copy {count} Image URLs'},
      },
    });
  });

  it('passes the en.json accessibility labels in the library placeholder syntax', () => {
    render(<MarkdownView markdownText="a" maxMessageWidth={300} />);

    expect(lastProps().accessibilityLabels).toEqual({
      list: {
        bulletPoint: en.accessibility.bulletPoint,
        nestedBulletPoint: en.accessibility.nestedBulletPoint,
        orderedItem: 'List item {n}',
        nestedOrderedItem: 'Nested list item {n}',
      },
      blockquote: {
        quote: en.accessibility.quote,
        nestedQuote: en.accessibility.nestedQuote,
      },
      table: {row: 'Row {n}: {content}'},
      rotor: {
        headings: en.accessibility.rotorHeadings,
        links: en.accessibility.rotorLinks,
        images: en.accessibility.rotorImages,
      },
    });
  });

  it('takes every library label from the active language', () => {
    const translated = JSON.parse(JSON.stringify(l10n.en));
    const markdownView = translated.components.markdownView;
    for (const group of [
      markdownView.selectionMenu,
      markdownView.accessibility,
    ]) {
      for (const key of Object.keys(group)) {
        group[key] = `x-${group[key]}`;
      }
    }

    render(
      <L10nContext.Provider value={translated}>
        <MarkdownView markdownText="a" maxMessageWidth={300} />
      </L10nContext.Provider>,
    );

    const {selectionMenuConfig, accessibilityLabels} = lastProps();
    const labels = [
      selectionMenuConfig.copy.label,
      selectionMenuConfig.copyAsMarkdown.label,
      selectionMenuConfig.copyImageUrl.label,
      selectionMenuConfig.copyImageUrl.pluralLabels.other,
      ...Object.values(accessibilityLabels).flatMap(group =>
        Object.values(group as Record<string, string>),
      ),
    ];
    expect(labels).toHaveLength(14);
    labels.forEach(label => expect(label).toMatch(/^x-/));
  });

  it('opens a pressed link', () => {
    const openURL = jest
      .spyOn(Linking, 'openURL')
      .mockResolvedValue(undefined as never);
    render(
      <MarkdownView markdownText="[a](https://x.y)" maxMessageWidth={1} />,
    );

    lastProps().onLinkPress({url: 'https://example.com'});

    expect(openURL).toHaveBeenCalledWith('https://example.com');
    openURL.mockRestore();
  });

  describe('link long-press', () => {
    it('passes no link long-press handler by default', () => {
      render(<MarkdownView markdownText="a" maxMessageWidth={300} />);

      expect(lastProps().onLinkLongPress).toBeUndefined();
    });

    it('hands the touch that started the hold to onLinkLongPress', () => {
      const onLinkLongPress = jest.fn();
      const {getByTestId} = render(
        <MarkdownView
          markdownText="[a](https://x.y)"
          maxMessageWidth={300}
          onLinkLongPress={onLinkLongPress}
        />,
      );
      const touch = {nativeEvent: {pageX: 10, pageY: 20}};

      fireEvent(getByTestId('markdown-content'), 'touchStart', touch);
      act(() => lastProps().onLinkLongPress({url: 'https://x.y'}));

      expect(onLinkLongPress).toHaveBeenCalledTimes(1);
      expect(onLinkLongPress).toHaveBeenCalledWith(touch);
    });

    it.each([
      ['releases', null],
      ['reuses', {target: 7}],
    ])(
      'keeps the touch-start point once RN %s the event',
      (_case, laterNativeEvent) => {
        const onLinkLongPress = jest.fn();
        const {getByTestId} = render(
          <MarkdownView
            markdownText="[a](https://x.y)"
            maxMessageWidth={300}
            onLinkLongPress={onLinkLongPress}
          />,
        );
        const touch: {nativeEvent: unknown} = {
          nativeEvent: {pageX: 10, pageY: 20},
        };

        fireEvent(getByTestId('markdown-content'), 'touchStart', touch);
        touch.nativeEvent = laterNativeEvent;
        act(() => lastProps().onLinkLongPress({url: 'https://x.y'}));

        expect(onLinkLongPress).toHaveBeenCalledWith({
          nativeEvent: {pageX: 10, pageY: 20},
        });
      },
    );

    it('re-renders when only onLinkLongPress changes', () => {
      const {rerender} = render(
        <MarkdownView markdownText="a" maxMessageWidth={300} />,
      );
      rerender(
        <MarkdownView
          markdownText="a"
          maxMessageWidth={300}
          onLinkLongPress={jest.fn()}
        />,
      );

      expect(lastProps().onLinkLongPress).toEqual(expect.any(Function));
    });
  });

  it('turns break tags into spaces before rendering', () => {
    render(<MarkdownView markdownText="one<br/>two" maxMessageWidth={300} />);

    expect(lastProps().markdown).toBe('one two');
  });

  it('spaces out break tags in a cell and a paragraph, never in code', () => {
    const reply =
      '| h | v |\n| --- | --- |\n| a | x<br>y |\n\none<br/>two\n\n`<br>`\n\n```\n<br>\n```';
    render(<MarkdownView markdownText={reply} maxMessageWidth={300} />);

    expect(lastProps().markdown).toBe(
      '| h | v |\n| --- | --- |\n| a | x y |\n\none two\n\n`<br>`\n\n```\n<br>\n```',
    );
  });

  it.each(['', '   ', '\n\n'])(
    'renders only the container for empty text %j',
    markdownText => {
      const {getByTestId} = render(
        <MarkdownView markdownText={markdownText} maxMessageWidth={300} />,
      );

      expect(getByTestId('markdown-content')).toBeTruthy();
      expect(spy).not.toHaveBeenCalled();
    },
  );

  it('caps the content at the message width', () => {
    const {getByTestId, rerender} = render(
      <MarkdownView markdownText="# Test" maxMessageWidth={300} />,
    );
    rerender(<MarkdownView markdownText="# Test" maxMessageWidth={200} />);

    const style = StyleSheet.flatten(
      getByTestId('markdown-content').props.style,
    );
    expect(style.maxWidth).toBe(200);
  });

  it('forwards selectable', () => {
    render(
      <MarkdownView
        markdownText="a"
        maxMessageWidth={300}
        selectable={false}
      />,
    );

    expect(lastProps().selectable).toBe(false);
  });

  it('turns the block popup on by default', () => {
    render(<MarkdownView markdownText="a" maxMessageWidth={300} />);

    expect(lastProps().enableBlockContextMenu).toBe(true);
  });

  it('forwards blockContextMenu as enableBlockContextMenu', () => {
    render(
      <MarkdownView
        markdownText="a"
        maxMessageWidth={300}
        blockContextMenu={false}
      />,
    );

    expect(lastProps().enableBlockContextMenu).toBe(false);
  });

  describe('markdownStyle', () => {
    const {colors} = themeFixtures.lightTheme;

    it('colours body text, links, inline code and tables from the theme', () => {
      render(<MarkdownView markdownText="a" maxMessageWidth={300} />);

      const style = lastProps().markdownStyle;
      expect(style.paragraph.color).toBe(colors.text);
      expect(style.h1.color).toBe(colors.text);
      expect(style.link).toEqual({color: colors.secondary, underline: true});
      expect(style.code.color).toBe(colors.onSurface);
      expect(style.code.backgroundColor).toBe(colors.surface);
      expect(style.table.headerBackgroundColor).toBe(
        colors.surfaceContainerHigh,
      );
      expect(style.table.borderColor).toBe(colors.outline);
      expect(style.table.rowEvenBackgroundColor).toBe('transparent');
      expect(Object.keys(style.codeBlock).sort()).toEqual([
        'marginBottom',
        'marginTop',
      ]);
    });

    it('sets chat-density typography and spacing', () => {
      render(<MarkdownView markdownText="a" maxMessageWidth={300} />);

      const style = lastProps().markdownStyle;
      const gap = {marginTop: 0, marginBottom: 8};
      expect(style.paragraph).toEqual(
        expect.objectContaining({fontSize: 16, lineHeight: 22, ...gap}),
      );
      expect(
        ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map(h => [
          style[h].fontSize,
          style[h].lineHeight,
        ]),
      ).toEqual([
        [22, 28],
        [20, 26],
        [18, 24],
        [17, 22],
        [16, 22],
        [16, 22],
      ]);
      for (const h of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
        expect(style[h]).toEqual(
          expect.objectContaining({
            fontWeight: 'bold',
            marginTop: 4,
            marginBottom: 4,
          }),
        );
      }
      expect(style.list).toEqual(
        expect.objectContaining({
          ...gap,
          marginLeft: 16,
          gapWidth: 6,
          itemSpacing: 0,
        }),
      );
      expect(style.blockquote).toEqual(
        expect.objectContaining({
          ...gap,
          borderWidth: 2,
          gapWidth: 8,
          padding: 4,
        }),
      );
      expect(style.thematicBreak).toEqual(
        expect.objectContaining({height: 1, marginTop: 12, marginBottom: 12}),
      );
      expect(style.table).toEqual(
        expect.objectContaining({
          ...gap,
          cellPaddingHorizontal: 8,
          cellPaddingVertical: 6,
        }),
      );
      expect(style.codeBlock).toEqual(gap);
    });

    it('draws quotes, list markers, strikethrough and task items in the body colour', () => {
      render(<MarkdownView markdownText="a" maxMessageWidth={300} />);

      const style = lastProps().markdownStyle;
      expect(style.blockquote.color).toBe(colors.text);
      expect(style.list.bulletColor).toBe(colors.text);
      expect(style.list.markerColor).toBe(colors.text);
      expect(style.strikethrough.color).toBe(colors.text);
      expect(style.taskList.borderColor).toBe(colors.text);
      expect(style.taskList.checkedTextColor).toBe(colors.text);
    });

    it.each([
      ['light', themeFixtures.lightTheme],
      ['dark', themeFixtures.darkTheme],
    ])('keeps quote text at 4.5:1 or more in the %s theme', (_mode, theme) => {
      (useTheme as jest.Mock).mockReturnValue(theme);
      try {
        render(<MarkdownView markdownText="a" maxMessageWidth={300} />);

        const {blockquote} = lastProps().markdownStyle;
        const quoteBackground = over(
          rgba(blockquote.backgroundColor),
          rgba(theme.colors.background),
        );
        const quoteText = over(rgba(blockquote.color), quoteBackground);
        expect(contrast(quoteText, quoteBackground)).toBeGreaterThanOrEqual(
          4.5,
        );
      } finally {
        (useTheme as jest.Mock).mockReturnValue(themeFixtures.lightTheme);
      }
    });

    it('uses the thinking colour and size for reasoning', () => {
      render(
        <MarkdownView
          markdownText="a"
          maxMessageWidth={300}
          variant="reasoning"
        />,
      );

      const style = lastProps().markdownStyle;
      expect(style.paragraph).toEqual({
        color: colors.thinkingBubbleText,
        fontSize: 14,
        lineHeight: 20,
        marginTop: 0,
        marginBottom: 8,
      });
      expect(style.h1.fontSize).toBe(22);
      expect(style.table.color).toBe(colors.thinkingBubbleText);
    });

    it('follows the dark theme', () => {
      (useTheme as jest.Mock).mockReturnValue(themeFixtures.darkTheme);
      try {
        render(<MarkdownView markdownText="a" maxMessageWidth={300} />);

        const style = lastProps().markdownStyle;
        expect(style.paragraph.color).toBe(themeFixtures.darkTheme.colors.text);
        expect(style.link.color).toBe(themeFixtures.darkTheme.colors.secondary);
      } finally {
        (useTheme as jest.Mock).mockReturnValue(themeFixtures.lightTheme);
      }
    });
  });

  describe('memo', () => {
    it('re-renders when only streamingAnimation changes', () => {
      const {rerender} = render(
        <MarkdownView
          markdownText="a"
          maxMessageWidth={300}
          streamingAnimation
        />,
      );
      rerender(
        <MarkdownView
          markdownText="a"
          maxMessageWidth={300}
          streamingAnimation={false}
        />,
      );

      expect(lastProps().streamingAnimation).toBe(false);
    });

    it('re-renders when only selectable changes', () => {
      const {rerender} = render(
        <MarkdownView markdownText="a" maxMessageWidth={300} selectable />,
      );
      rerender(
        <MarkdownView
          markdownText="a"
          maxMessageWidth={300}
          selectable={false}
        />,
      );

      expect(lastProps().selectable).toBe(false);
    });

    it('re-renders when only blockContextMenu changes', () => {
      const {rerender} = render(
        <MarkdownView markdownText="a" maxMessageWidth={300} />,
      );
      rerender(
        <MarkdownView
          markdownText="a"
          maxMessageWidth={300}
          blockContextMenu={false}
        />,
      );

      expect(lastProps().enableBlockContextMenu).toBe(false);
    });

    it('re-renders when only the variant changes', () => {
      const {rerender} = render(
        <MarkdownView markdownText="a" maxMessageWidth={300} />,
      );
      rerender(
        <MarkdownView
          markdownText="a"
          maxMessageWidth={300}
          variant="reasoning"
        />,
      );

      expect(lastProps().markdownStyle.paragraph.fontSize).toBe(14);
    });

    it('skips a re-render with unchanged props', () => {
      const {rerender} = render(
        <MarkdownView markdownText="a" maxMessageWidth={300} />,
      );
      const calls = spy.mock.calls.length;
      rerender(<MarkdownView markdownText="a" maxMessageWidth={300} />);

      expect(spy.mock.calls.length).toBe(calls);
    });

    it('keeps config props identical while the text streams', () => {
      const {rerender} = render(
        <MarkdownView markdownText="a" maxMessageWidth={300} />,
      );
      const first = lastProps();
      rerender(<MarkdownView markdownText="ab" maxMessageWidth={300} />);
      const second = lastProps();

      expect(second.markdown).toBe('ab');
      for (const key of [
        'md4cFlags',
        'onLinkPress',
        'selectionMenuConfig',
        'accessibilityLabels',
        'markdownStyle',
      ]) {
        expect(second[key]).toBe(first[key]);
      }
    });
  });
});
