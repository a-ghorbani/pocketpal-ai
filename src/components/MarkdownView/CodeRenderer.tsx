import React from 'react';
import {View} from 'react-native';

import CodeHighlighter from 'react-native-code-highlighter';
import {atomOneDark} from 'react-syntax-highlighter/dist/esm/styles/hljs';

import {useTheme} from '../../hooks';
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
export const CodeRenderer = ({TDefaultRenderer, ...props}: any) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const isCodeBlock = props?.tnode?.parent?.tagName === 'pre';
  if (!isCodeBlock) {
    return <TDefaultRenderer {...props} />;
  }

  const language =
    props.tnode?.domNode?.attribs?.class?.replace('language-', '') || 'text';

  // The react-native-render-html parser collapses whitespace in the DOM, so
  // pull the original text from tnode.init.domNode.rawHTML which preserves
  // newlines inside the <code> block.
  const rawHtml =
    props.tnode?.init?.domNode?.rawHTML ||
    props.tnode?.domNode?.rawHTML ||
    props.tnode?.domNode?.children?.[0]?.data ||
    '';
  const content = decodeHTMLEntities(rawHtml);

  return (
    <View>
      <CodeBlockHeader language={language} content={content} />
      <CodeHighlighter
        hljsStyle={atomOneDark}
        language={language}
        textStyle={styles.codeHighlighterText}
        scrollViewProps={{
          contentContainerStyle: styles.codeHighlighterScrollContent,
        }}
        customStyle={codeHighlighterPreOverride}>
        {content}
      </CodeHighlighter>
    </View>
  );
};
