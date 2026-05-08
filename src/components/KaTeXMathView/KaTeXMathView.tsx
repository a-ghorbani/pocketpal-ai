import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import {WebView} from 'react-native-webview';
import type {WebViewMessageEvent} from 'react-native-webview';
import {renderToString} from 'katex';

import {useTheme} from '../../hooks';
import {L10nContext} from '../../utils';
import {Theme} from '../../utils/types';
import {KATEX_CSS} from '../../utils/messageRendering/katexAssets';

interface KaTeXMathViewProps {
  source: string;
  displayMode: boolean;
  maxWidth: number;
  selectable?: boolean;
  copyable?: boolean;
}

interface MathSize {
  height: number;
  width: number;
}

const sizeCache = new Map<string, MathSize>();
const MAX_CACHE_ENTRIES = 200;
const MIN_INLINE_HEIGHT = 30;
const MIN_BLOCK_HEIGHT = 52;
const MAX_WEBVIEW_HEIGHT = 360;
const hapticOptions = {
  enableVibrateFallback: true,
  ignoreAndroidSystemSettings: false,
};

const MEASURE_SCRIPT = `
(function() {
  function postSize() {
    var root = document.getElementById('math-root') || document.body;
    var rect = root.getBoundingClientRect();
    var width = Math.ceil(Math.max(rect.width, root.scrollWidth, document.body.scrollWidth));
    var height = Math.ceil(Math.max(rect.height, root.scrollHeight, document.body.scrollHeight));
    window.ReactNativeWebView.postMessage(JSON.stringify({ width: width, height: height }));
  }
  requestAnimationFrame(postSize);
  setTimeout(postSize, 80);
  true;
})();
`;

function hashText(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) % 2147483647;
  }
  return Math.abs(hash).toString(36);
}

function clampSize(
  size: Partial<MathSize>,
  displayMode: boolean,
  maxWidth: number,
): MathSize {
  const minHeight = displayMode ? MIN_BLOCK_HEIGHT : MIN_INLINE_HEIGHT;
  const width = Math.max(1, Math.ceil(size.width || maxWidth));
  const height = Math.min(
    MAX_WEBVIEW_HEIGHT,
    Math.max(minHeight, Math.ceil(size.height || minHeight)),
  );

  return {
    width: displayMode ? Math.max(maxWidth, width) : Math.min(maxWidth, width),
    height,
  };
}

function cacheSize(key: string, size: MathSize) {
  if (sizeCache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = sizeCache.keys().next().value;
    if (firstKey) {
      sizeCache.delete(firstKey);
    }
  }
  sizeCache.set(key, size);
}

function renderKaTeX(source: string, displayMode: boolean): string | undefined {
  try {
    const html = renderToString(source, {
      displayMode,
      throwOnError: false,
      trust: false,
      strict: 'warn',
      output: 'htmlAndMathml',
    });

    return html.includes('katex-error') ? undefined : html;
  } catch {
    return undefined;
  }
}

function buildHtml(
  renderedMath: string,
  displayMode: boolean,
  textColor: string,
  backgroundColor: string,
) {
  const alignment = displayMode ? 'center' : 'left';
  const bodyDisplay = displayMode ? 'block' : 'inline-block';

  return `<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>
${KATEX_CSS}
html, body {
  background: ${backgroundColor};
  color: ${textColor};
  margin: 0;
  padding: 0;
  overflow: hidden;
}
body {
  display: ${bodyDisplay};
  min-width: 1px;
}
#math-root {
  box-sizing: border-box;
  color: ${textColor};
  display: ${bodyDisplay};
  padding: ${displayMode ? '8px 10px' : '2px 4px'};
  text-align: ${alignment};
}
.katex {
  color: ${textColor};
  font-size: ${displayMode ? '1.08em' : '1em'};
}
.katex-display {
  margin: 0;
}
a, img, script, iframe {
  display: none !important;
}
</style>
</head>
<body>
<main id="math-root">${renderedMath}</main>
</body>
</html>`;
}

export const KaTeXMathView: React.FC<KaTeXMathViewProps> = ({
  source,
  displayMode,
  maxWidth,
  selectable = false,
  copyable = true,
}) => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const styles = useMemo(() => createStyles(theme), [theme]);
  const cacheKey = useMemo(
    () => `${displayMode ? 'block' : 'inline'}:${maxWidth}:${hashText(source)}`,
    [displayMode, maxWidth, source],
  );
  const getInitialSize = useCallback(
    () =>
      sizeCache.get(cacheKey) ||
      clampSize(
        {
          height: displayMode ? MIN_BLOCK_HEIGHT : MIN_INLINE_HEIGHT,
          width: displayMode ? maxWidth : Math.min(maxWidth, source.length * 9),
        },
        displayMode,
        maxWidth,
      ),
    [cacheKey, displayMode, maxWidth, source.length],
  );
  const [size, setSize] = useState<MathSize>(getInitialSize);
  const [failed, setFailed] = useState(false);
  const renderedMath = useMemo(
    () => renderKaTeX(source, displayMode),
    [displayMode, source],
  );
  const html = useMemo(
    () =>
      renderedMath
        ? buildHtml(
            renderedMath,
            displayMode,
            theme.colors.onSurface,
            theme.colors.surfaceContainerHigh,
          )
        : undefined,
    [
      displayMode,
      renderedMath,
      theme.colors.onSurface,
      theme.colors.surfaceContainerHigh,
    ],
  );

  useEffect(() => {
    setFailed(false);
    setSize(getInitialSize());
  }, [getInitialSize]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const nextSize = clampSize(
          JSON.parse(event.nativeEvent.data),
          displayMode,
          maxWidth,
        );
        cacheSize(cacheKey, nextSize);
        setSize(nextSize);
      } catch {
        // Keep the current conservative size if measurement fails.
      }
    },
    [cacheKey, displayMode, maxWidth],
  );

  const handleShouldStartLoad = useCallback((request: {url?: string}) => {
    const url = request.url || '';
    return !url || url === 'about:blank' || url.startsWith('about:blank#');
  }, []);
  const handleCopyLatex = useCallback(() => {
    ReactNativeHapticFeedback.trigger('impactLight', hapticOptions);
    Clipboard.setString(source);
  }, [source]);

  const copyLabel = l10n.components.assistantMessageRenderer.segments.copyLatex;

  const wrapCopyTarget = useCallback(
    (children: React.ReactNode, style?: object | object[]) => {
      if (!copyable) {
        return style ? <View style={style}>{children}</View> : <>{children}</>;
      }

      return (
        <Pressable
          accessibilityLabel={copyLabel}
          accessibilityRole="button"
          delayLongPress={250}
          onLongPress={handleCopyLatex}
          style={style}>
          {children}
        </Pressable>
      );
    },
    [copyLabel, copyable, handleCopyLatex],
  );

  if (!html || failed) {
    const fallback = displayMode ? (
      <ScrollView
        horizontal
        nestedScrollEnabled
        style={styles.blockFallbackScroll}
        contentContainerStyle={styles.blockFallbackContent}>
        <Text selectable={selectable} style={styles.blockFallbackText}>
          {source}
        </Text>
      </ScrollView>
    ) : (
      <Text selectable={selectable} style={styles.inlineFallbackText}>
        {source}
      </Text>
    );

    return wrapCopyTarget(fallback);
  }

  const webView = (
    <WebView
      testID={
        displayMode ? 'katex-math-block-webview' : 'katex-math-inline-webview'
      }
      originWhitelist={['about:blank']}
      source={{html}}
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
      style={[
        styles.webView,
        {
          height: size.height,
          width: size.width,
        },
      ]}
    />
  );

  if (displayMode) {
    return wrapCopyTarget(
      <ScrollView
        horizontal
        nestedScrollEnabled
        style={styles.blockScroll}
        contentContainerStyle={styles.blockContent}>
        {webView}
      </ScrollView>,
    );
  }

  return wrapCopyTarget(webView, [
    styles.inlineContainer,
    {
      height: size.height,
      width: size.width,
    },
  ]);
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
