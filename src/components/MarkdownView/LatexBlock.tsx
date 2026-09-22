import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
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
  MIN_BLOCK_MATH_HEIGHT,
  MIN_INLINE_MATH_HEIGHT,
  renderTexToHtml,
  setCachedMathSize,
} from './katexDoc';

interface LatexBlockProps {
  tex: string;
  displayMode: boolean;
  maxWidth: number;
}

/**
 * Single display formula (centered) or standalone inline formula.
 * Same offline envelope as MathParagraphView: static pre-rendered HTML,
 * all resources inlined, navigation pinned to about:blank.
 */
export const LatexBlock: React.FC<LatexBlockProps> = ({
  tex,
  displayMode,
  maxWidth,
}) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const minHeight = displayMode
    ? MIN_BLOCK_MATH_HEIGHT
    : MIN_INLINE_MATH_HEIGHT;
  const cacheKey = useMemo(
    () => `${displayMode ? 'block' : 'inline'}:${maxWidth}:${hashText(tex)}`,
    [displayMode, maxWidth, tex],
  );
  const getInitialSize = useCallback(
    (): MeasuredSize =>
      getCachedMathSize(cacheKey) ||
      clampMeasuredSize(
        {
          height: minHeight,
          width: displayMode ? maxWidth : Math.min(maxWidth, tex.length * 9),
        },
        {minHeight, maxWidth, fullWidth: displayMode},
      ),
    [cacheKey, displayMode, maxWidth, minHeight, tex.length],
  );
  const [size, setSize] = useState<MeasuredSize>(getInitialSize);
  const [failed, setFailed] = useState(false);
  const renderedMath = useMemo(
    () => renderTexToHtml(tex, displayMode),
    [displayMode, tex],
  );
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
            {center: displayMode, pad: displayMode ? '8px 10px' : '2px 4px'},
          )
        : undefined,
    [
      displayMode,
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
          minHeight,
          maxWidth,
          fullWidth: displayMode,
        });
        setCachedMathSize(cacheKey, nextSize);
        setSize(nextSize);
      } catch {
        // Keep the conservative size if measurement fails.
      }
    },
    [cacheKey, displayMode, maxWidth, minHeight],
  );

  const handleShouldStartLoad = useCallback((request: {url?: string}) => {
    const url = request.url || '';
    return !url || url === 'about:blank' || url.startsWith('about:blank#');
  }, []);

  if (!html || failed) {
    // Fallback shows the raw TeX so content is never lost (and stays
    // copyable/selectable via the native Text path).
    if (displayMode) {
      return (
        <ScrollView
          horizontal
          nestedScrollEnabled
          style={styles.blockFallbackScroll}
          contentContainerStyle={styles.blockFallbackContent}>
          <Text
            testID="latex-block-fallback"
            accessibilityLabel={tex}
            style={styles.blockFallbackText}>
            {tex}
          </Text>
        </ScrollView>
      );
    }
    return (
      <Text
        testID="latex-block-fallback"
        accessibilityLabel={tex}
        style={styles.inlineFallbackText}>
        {tex}
      </Text>
    );
  }

  const webView = (
    <WebView
      testID={
        displayMode ? 'latex-math-block-webview' : 'latex-math-inline-webview'
      }
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
  );

  if (displayMode) {
    return (
      <ScrollView
        horizontal
        nestedScrollEnabled
        style={styles.blockScroll}
        contentContainerStyle={styles.blockContent}>
        {webView}
      </ScrollView>
    );
  }

  return (
    <View style={[styles.inlineContainer, {height: size.height}]}>
      {webView}
    </View>
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    inlineContainer: {
      backgroundColor: theme.colors.surfaceContainerHigh,
      borderRadius: 4,
      overflow: 'hidden',
    },
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
    inlineFallbackText: {
      color: theme.colors.onSurface,
      backgroundColor: theme.colors.surfaceContainerHigh,
      borderRadius: 4,
      fontFamily: 'Courier',
      fontSize: 14,
      paddingHorizontal: 3,
    },
    blockFallbackScroll: {
      backgroundColor: theme.colors.surfaceContainerHigh,
      borderRadius: 6,
      marginVertical: 8,
    },
    blockFallbackContent: {
      padding: 10,
    },
    blockFallbackText: {
      color: theme.colors.onSurface,
      fontFamily: 'Courier',
      fontSize: 15,
      lineHeight: 22,
    },
  });
