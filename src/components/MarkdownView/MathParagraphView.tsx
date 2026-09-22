import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {Linking, StyleSheet, Text, View} from 'react-native';
import {WebView} from 'react-native-webview';
import type {WebViewMessageEvent} from 'react-native-webview';

import {useTheme} from '../../hooks';
import {Theme} from '../../utils/types';

import {
  buildKatexDoc,
  clampMeasuredSize,
  getCachedMathSize,
  hashText,
  MEASURE_SCRIPT,
  MeasuredSize,
  MIN_PARAGRAPH_HEIGHT,
  renderParagraphHtml,
  setCachedMathSize,
} from './katexDoc';

interface MathParagraphViewProps {
  /** One markdown paragraph (no blank lines) containing inline math. */
  raw: string;
  maxWidth: number;
}

/**
 * Renders a paragraph with in-flow inline math in a single WebView, so
 * formulas sit inside the sentence (with trailing punctuation attached)
 * instead of stacking as separate rows. Markdown around the math keeps
 * app-like styling via the shared KaTeX document layer.
 *
 * Envelope (same as LatexBlock): static pre-rendered HTML, all resources
 * inlined, navigation pinned to about:blank. http(s) links open externally
 * via Linking so they stay tappable; everything else is blocked.
 */
export const MathParagraphView: React.FC<MathParagraphViewProps> = ({
  raw,
  maxWidth,
}) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const colors = useMemo(
    () => ({
      text: theme.colors.onSurface,
      background: 'transparent',
      link: theme.colors.secondary,
      codeBackground: theme.colors.surface,
    }),
    [theme],
  );

  const {html, mathCount} = useMemo(() => {
    const {html: bodyHtml, mathCount: count} = renderParagraphHtml(raw);
    if (count === 0) {
      return {html: undefined as string | undefined, mathCount: 0};
    }
    return {html: buildKatexDoc(bodyHtml, colors), mathCount: count};
  }, [raw, colors]);

  const cacheKey = useMemo(
    () => `para:${maxWidth}:${hashText(raw)}`,
    [maxWidth, raw],
  );
  const getInitialSize = useCallback(
    (): MeasuredSize =>
      getCachedMathSize(cacheKey) ||
      clampMeasuredSize(
        {height: MIN_PARAGRAPH_HEIGHT, width: maxWidth},
        {minHeight: MIN_PARAGRAPH_HEIGHT, maxWidth, fullWidth: true},
      ),
    [cacheKey, maxWidth],
  );
  const [size, setSize] = useState<MeasuredSize>(getInitialSize);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    setSize(getInitialSize());
  }, [getInitialSize]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const nextSize = clampMeasuredSize(JSON.parse(event.nativeEvent.data), {
          minHeight: MIN_PARAGRAPH_HEIGHT,
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
    if (!url || url === 'about:blank' || url.startsWith('about:blank#')) {
      return true;
    }
    if (/^https?:\/\//i.test(url)) {
      Linking.openURL(url).catch(() => {});
      return false;
    }
    return false;
  }, []);

  if (mathCount === 0 || !html || failed) {
    // Last-resort fallback: raw markdown as plain text so content survives
    // even a total WebView failure.
    return (
      <View style={styles.fallbackContainer}>
        <Text testID="latex-paragraph-fallback" style={styles.fallbackText}>
          {raw}
        </Text>
      </View>
    );
  }

  return (
    <WebView
      testID="latex-paragraph-webview"
      originWhitelist={['about:blank', 'http://*', 'https://*']}
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
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    webView: {
      backgroundColor: 'transparent',
      opacity: 0.99,
    },
    fallbackContainer: {
      backgroundColor: theme.colors.surfaceContainerHigh,
      borderRadius: 6,
      padding: 10,
    },
    fallbackText: {
      color: theme.colors.onSurface,
      fontSize: 15,
    },
  });
