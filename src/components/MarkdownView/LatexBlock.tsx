import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import {WebView} from 'react-native-webview';
import type {WebViewMessageEvent} from 'react-native-webview';

import CodeHighlighter from 'react-native-code-highlighter';
import {atomOneDark} from 'react-syntax-highlighter/dist/esm/styles/hljs';

import {useTheme} from '../../hooks';
import {Theme} from '../../utils/types';
import {CodeBlockHeader} from '../CodeBlockHeader';

import {codeHighlighterPreOverride} from './styles';

import {
  buildKatexDoc,
  clampMeasuredSize,
  getCachedMathSize,
  hashText,
  MEASURE_SCRIPT,
  MeasuredSize,
  MIN_BLOCK_MATH_HEIGHT,
  renderTexToHtml,
  setCachedMathSize,
} from './katexDoc';

interface LatexBlockProps {
  tex: string;
  maxWidth: number;
}

/**
 * Single centered display formula. Same offline envelope as
 * MathParagraphView: static pre-rendered HTML, all resources inlined,
 * navigation pinned to about:blank.
 */
export const LatexBlock: React.FC<LatexBlockProps> = ({tex, maxWidth}) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const cacheKey = useMemo(
    () => `block:${maxWidth}:${hashText(tex)}`,
    [maxWidth, tex],
  );
  const getInitialSize = useCallback(
    (): MeasuredSize =>
      getCachedMathSize(cacheKey) ||
      clampMeasuredSize(
        {height: MIN_BLOCK_MATH_HEIGHT, width: maxWidth},
        {
          minHeight: MIN_BLOCK_MATH_HEIGHT,
          maxWidth,
          fullWidth: true,
        },
      ),
    [cacheKey, maxWidth],
  );
  const [size, setSize] = useState<MeasuredSize>(getInitialSize);
  const [failed, setFailed] = useState(false);
  const renderedMath = useMemo(() => renderTexToHtml(tex, true), [tex]);
  const html = useMemo(
    () =>
      renderedMath
        ? buildKatexDoc(
            renderedMath,
            {
              text: theme.colors.onSurface,
              background: theme.colors.surfaceContainerHigh,
              link: theme.colors.secondary,
              codeBackground: theme.colors.surface,
            },
            {center: true, pad: '8px 10px'},
          )
        : undefined,
    [
      renderedMath,
      theme.colors.onSurface,
      theme.colors.surfaceContainerHigh,
      theme.colors.secondary,
      theme.colors.surface,
    ],
  );

  useEffect(() => {
    setFailed(false);
    setSize(getInitialSize());
  }, [getInitialSize]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const nextSize = clampMeasuredSize(JSON.parse(event.nativeEvent.data), {
          minHeight: MIN_BLOCK_MATH_HEIGHT,
          maxWidth,
          fullWidth: true,
        });
        setCachedMathSize(cacheKey, nextSize);
        setSize(nextSize);
      } catch {
        // Keep the conservative size if measurement fails.
      }
    },
    [cacheKey, maxWidth],
  );

  const handleShouldStartLoad = useCallback((request: {url?: string}) => {
    const url = request.url || '';
    return !url || url === 'about:blank' || url.startsWith('about:blank#');
  }, []);

  if (!html || failed) {
    // Fallback uses the standard code-block UI (language header + copy
    // button) so rejected formulas look like every other code block.
    return (
      <View testID="latex-block-fallback" accessibilityLabel={tex}>
        <CodeBlockHeader language="tex" content={tex} />
        <CodeHighlighter
          hljsStyle={atomOneDark}
          language="tex"
          textStyle={styles.codeText}
          scrollViewProps={{
            contentContainerStyle: styles.codeContent,
          }}
          customStyle={codeHighlighterPreOverride}>
          {tex}
        </CodeHighlighter>
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      nestedScrollEnabled
      style={styles.blockScroll}
      contentContainerStyle={styles.blockContent}>
      <WebView
        testID="latex-math-block-webview"
        accessibilityLabel={tex}
        originWhitelist={['about:blank']}
        source={{html, baseUrl: 'about:blank'}}
        javaScriptEnabled
        domStorageEnabled={false}
        allowFileAccess={false}
        allowUniversalAccessFromFileURLs={false}
        javaScriptCanOpenWindowsAutomatically={false}
        mixedContentMode="never"
        setSupportMultipleWindows={false}
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        injectedJavaScript={MEASURE_SCRIPT}
        onMessage={handleMessage}
        onError={() => setFailed(true)}
        onHttpError={() => setFailed(true)}
        onShouldStartLoadWithRequest={handleShouldStartLoad}
        style={[styles.webView, {height: size.height, width: size.width}]}
      />
    </ScrollView>
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    webView: {
      backgroundColor: 'transparent',
      opacity: 0.99,
    },
    blockScroll: {
      backgroundColor: theme.colors.surfaceContainerHigh,
      borderRadius: 6,
      marginVertical: 8,
    },
    blockContent: {
      alignItems: 'center',
    },
    codeText: {
      fontFamily: 'Courier',
    },
    codeContent: {
      backgroundColor: theme.colors.surface,
      padding: 8,
      borderRadius: 6,
      marginTop: 4,
    },
  });
