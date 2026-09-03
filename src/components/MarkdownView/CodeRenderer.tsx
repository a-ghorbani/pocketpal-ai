import React, {useEffect, useState} from 'react';
import {ScrollView, Text, View} from 'react-native';

import CodeHighlighter from 'react-native-code-highlighter';
import {
  atomOneDark,
  atomOneLight,
} from 'react-syntax-highlighter/dist/esm/styles/hljs';
import {observer} from 'mobx-react-lite';

import {useTheme} from '../../hooks';
import {uiStore} from '../../store';
import {defaultMessageRenderingSettings} from '../../utils/messageRendering';
import {CodeBlockHeader} from '../CodeBlockHeader';

import {codeHighlighterPreOverride, createStyles} from './styles';

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
  '&nbsp;': ' ',
  '&apos;': "'",
};

function decodeHTMLEntities(text: string): string {
  let decoded = text.replace(/&[a-z]+;/gi, e => ENTITIES[e] || e);
  decoded = decoded.replace(/&#(\d+);/g, (_m, dec) =>
    String.fromCharCode(parseInt(dec, 10)),
  );
  decoded = decoded.replace(/&#x([0-9a-f]+);/gi, (_m, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
  return decoded;
}

/**
 * react-native-render-html `code` renderer. Hoisted out of MarkdownView so
 * the provider-level `renderers` object can reference it as a stable
 * module-level function — the lib's profiler warns when `renderers` changes
 * between renders.
 *
 * `useTheme()` is read at render time, so theme switches still work; only
 * the renderer-function identity needs to be stable.
 */
export const CodeRenderer = observer(({TDefaultRenderer, ...props}: any) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const settings = {
    ...defaultMessageRenderingSettings,
    ...uiStore.messageRenderingSettings,
  };
  const configuredWrapLines = settings.wrapCodeLines;
  const [wrapLines, setWrapLines] = useState(configuredWrapLines);
  const useSyntaxHighlighting = settings.useSyntaxHighlighting;
  const syntaxTheme =
    uiStore.colorScheme === 'dark' ? atomOneDark : atomOneLight;

  useEffect(() => {
    setWrapLines(configuredWrapLines);
  }, [configuredWrapLines]);
  const isCodeBlock = props?.tnode?.parent?.tagName === 'pre';
  if (!isCodeBlock) {
    return <TDefaultRenderer {...props} />;
  }

  const className = props.tnode?.domNode?.attribs?.class || '';
  const language =
    className
      .split(/\s+/)
      .find((name: string) => name.startsWith('language-'))
      ?.replace('language-', '') ||
    className.replace('language-', '').split(/\s+/)[0] ||
    'text';

  // The react-native-render-html parser collapses whitespace in the DOM, so
  // pull the original text from tnode.init.domNode.rawHTML which preserves
  // newlines inside the <code> block.
  const rawHtml =
    props.tnode?.init?.domNode?.rawHTML ||
    props.tnode?.domNode?.rawHTML ||
    props.tnode?.domNode?.children?.[0]?.data ||
    '';
  const content = decodeHTMLEntities(rawHtml);

  const fallbackCode = (
    <ScrollView
      horizontal={!wrapLines}
      nestedScrollEnabled
      style={styles.codeFallbackScroll}
      contentContainerStyle={styles.codeFallbackContent}>
      <Text
        selectable
        style={[styles.codeFallbackText, wrapLines && styles.codeWrapText]}>
        {content}
      </Text>
    </ScrollView>
  );

  return (
    <View>
      <CodeBlockHeader
        language={language}
        content={content}
        wrapLines={wrapLines}
        onToggleWrapLines={() => setWrapLines(value => !value)}
      />
      {useSyntaxHighlighting ? (
        <CodeHighlighter
          hljsStyle={syntaxTheme}
          language={language}
          textStyle={[
            styles.codeHighlighterText,
            wrapLines && styles.codeWrapText,
          ]}
          scrollViewProps={{
            horizontal: !wrapLines,
            nestedScrollEnabled: true,
            contentContainerStyle: styles.codeHighlighterScrollContent,
          }}
          customStyle={codeHighlighterPreOverride}>
          {content}
        </CodeHighlighter>
      ) : (
        fallbackCode
      )}
    </View>
  );
});
