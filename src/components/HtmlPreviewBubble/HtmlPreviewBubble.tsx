import React, {useCallback, useContext, useMemo, useState} from 'react';
import {Modal, ScrollView, Text, TouchableOpacity, View} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import {WebView} from 'react-native-webview';
import Clipboard from '@react-native-clipboard/clipboard';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import CodeHighlighter from 'react-native-code-highlighter';
import {atomOneDark} from 'react-syntax-highlighter/dist/esm/styles/hljs';

import {
  BrowserIcon,
  CloseIcon,
  CodeIcon,
  CopyIcon,
  ExpandIcon,
} from '../../assets/icons';
import {useTheme} from '../../hooks';
import {L10nContext} from '../../utils';

import {createStyles} from './styles';

const hapticOptions = {
  enableVibrateFallback: true,
  ignoreAndroidSystemSettings: false,
};

interface HtmlPreviewBubbleProps {
  html: string;
  title?: string;
}

// NOTE: v1.1 spike — JS enabled for game/interactive testing. Keeps strict
// default-src 'none' so network/external resources are still blocked.
// `'unsafe-inline'` + `'unsafe-eval'` on script-src because model-generated
// games often use eval-like patterns (Function, setTimeout(string)).
const CSP =
  "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline' 'unsafe-eval'; img-src data:; font-src data:";

const HEAD_INJECTION = `<meta http-equiv="Content-Security-Policy" content="${CSP}" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style data-preview-override>
  /* Override common desktop-first CSS that breaks in a small preview
     viewport. Models often set body { height: 100vh } + flex-centering,
     which pushes content off-screen when intrinsic content height exceeds
     the bubble height. Force body to grow with content instead. */
  html, body { height: auto !important; min-height: 100% !important; }
  /* Constrain content to the viewport width. Models often emit fixed
     pixel widths (e.g. 1024px containers, full-bleed images, wide
     tables) that would otherwise overflow horizontally inside the
     chat bubble — and horizontal scroll in a chat row reads as broken.
     Cap top-level children and common wide elements; let tables/pre
     scroll internally so their content is still reachable. */
  body > * { max-width: 100vw; box-sizing: border-box; }
  img, video, iframe, svg, canvas { max-width: 100%; height: auto; }
  table, pre, code { max-width: 100%; overflow-x: auto; }
</style>`;

const FRAGMENT_STYLES = `<style>
  html, body { margin: 0; padding: 12px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
  @media (prefers-color-scheme: dark) {
    html, body { background: #1c1c1e; color: #f5f5f7; }
    a { color: #4ea3ff; }
  }
</style>`;

/**
 * Renders model-supplied HTML inside an isolated WebView. Security envelope:
 *  - originWhitelist + onShouldStartLoadWithRequest pin navigation to about:blank
 *  - CSP default-src 'none' blocks all external resource loads
 *  - script-src 'unsafe-inline' 'unsafe-eval' (deliberate v1.1 tradeoff for games)
 *  - no onMessage / injectedJavaScript → no native bridge surface
 * Residual risk: model-generated JS can pin CPU / drain battery via infinite
 * loops; cannot exfiltrate data over the network or escape the WebView origin.
 *
 * Handles two shapes the model can emit:
 *   1. Full document (<!doctype ...><html>...) — inject CSP + viewport into
 *      the existing <head>; do NOT re-wrap (nested <html>/<body> tags get
 *      mangled by the HTML parser and drop the model's <style> block).
 *   2. Fragment — wrap in a minimal document with our default styles.
 */
function wrapDocument(html: string): string {
  const trimmed = html.trim();
  const isFullDoc =
    /^<!doctype\s/i.test(trimmed) || /^<html[\s>]/i.test(trimmed);

  if (isFullDoc) {
    if (/<head[^>]*>/i.test(trimmed)) {
      return trimmed.replace(
        /<head[^>]*>/i,
        match => `${match}\n${HEAD_INJECTION}`,
      );
    }
    if (/<html[^>]*>/i.test(trimmed)) {
      // Full doc without explicit <head>: inject one right after <html ...>
      return trimmed.replace(
        /<html[^>]*>/i,
        match => `${match}\n<head>${HEAD_INJECTION}</head>`,
      );
    }
    // Malformed full doc (e.g. <!doctype html><body>...) — no <html> or <head>
    // to inject into. Fall through to fragment wrapping to ensure CSP.
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
${HEAD_INJECTION}
${FRAGMENT_STYLES}
</head>
<body>
${trimmed}
</body>
</html>`;
}

export const HtmlPreviewBubble: React.FC<HtmlPreviewBubbleProps> = ({
  html,
  title,
}) => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const [fullscreen, setFullscreen] = useState(false);
  const [showCode, setShowCode] = useState(false);

  const styles = useMemo(
    () =>
      createStyles({
        background: theme.colors.surface,
        border: theme.colors.outline,
        text: theme.colors.onSurface,
        headerBg: theme.colors.surfaceVariant,
        modalOverlay: theme.colors.background,
      }),
    [theme],
  );

  const wrappedHtml = useMemo(() => wrapDocument(html), [html]);
  const displayTitle =
    title && title.length > 0 ? title : l10n.htmlPreview.defaultTitle;

  const copyHtml = useCallback(() => {
    ReactNativeHapticFeedback.trigger('impactLight', hapticOptions);
    Clipboard.setString(html);
  }, [html]);

  return (
    <View testID="html-preview-bubble">
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {displayTitle}
          </Text>
          <TouchableOpacity
            onPress={() => setShowCode(s => !s)}
            accessibilityRole="button"
            accessibilityLabel={
              showCode
                ? l10n.htmlPreview.showPreview
                : l10n.htmlPreview.showCode
            }
            testID="html-preview-toggle-code"
            hitSlop={8}
            style={styles.headerButton}>
            {showCode ? (
              <BrowserIcon
                stroke={theme.colors.onSurfaceVariant}
                width={18}
                height={18}
              />
            ) : (
              <CodeIcon
                stroke={theme.colors.onSurfaceVariant}
                width={18}
                height={18}
              />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={copyHtml}
            accessibilityRole="button"
            accessibilityLabel={l10n.htmlPreview.copyHtml}
            testID="html-preview-copy"
            hitSlop={8}
            style={styles.headerButton}>
            <CopyIcon
              stroke={theme.colors.onSurfaceVariant}
              width={18}
              height={18}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setFullscreen(true)}
            accessibilityRole="button"
            accessibilityLabel={l10n.htmlPreview.openFullscreen.replace(
              '{{title}}',
              displayTitle,
            )}
            testID="html-preview-bubble-collapsed"
            hitSlop={8}
            style={styles.headerButton}>
            <ExpandIcon
              stroke={theme.colors.onSurfaceVariant}
              width={18}
              height={18}
            />
          </TouchableOpacity>
        </View>
        {showCode ? (
          <ScrollView
            style={[styles.collapsedWebView, styles.codeSurface]}
            testID="html-preview-code">
            <CodeHighlighter
              hljsStyle={atomOneDark}
              language="html"
              textStyle={styles.codeText}
              scrollViewProps={{
                style: styles.codeInnerScroll,
                contentContainerStyle: styles.codeContent,
              }}>
              {html}
            </CodeHighlighter>
          </ScrollView>
        ) : (
          <WebView
            source={{html: wrappedHtml, baseUrl: 'about:blank'}}
            javaScriptEnabled={true}
            originWhitelist={['about:blank']}
            onShouldStartLoadWithRequest={req => req.url === 'about:blank'}
            scrollEnabled={true}
            style={styles.collapsedWebView}
            testID="html-preview-webview"
          />
        )}
      </View>

      <Modal
        visible={fullscreen}
        animationType="slide"
        onRequestClose={() => setFullscreen(false)}
        // iOS Modal's default is portrait-only, which would lock the
        // fullscreen view to portrait even when the parent app is
        // already rotated. Mirror Info.plist (Portrait + Landscape on
        // iPhone, plus portrait-upside-down on iPad).
        supportedOrientations={[
          'portrait',
          'portrait-upside-down',
          'landscape',
        ]}
        testID="html-preview-modal">
        {/* Re-provide SafeAreaProvider: Modal renders in a separate view
            hierarchy on iOS and does not inherit insets from the app-level
            provider, so the top safe area would otherwise collapse to 0 and
            hide the Close button behind the notch/status bar. */}
        <SafeAreaProvider>
          <SafeAreaView
            style={styles.modalRoot}
            edges={['top', 'bottom', 'left', 'right']}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={1}>
                {displayTitle}
              </Text>
              <TouchableOpacity
                onPress={() => setShowCode(s => !s)}
                accessibilityRole="button"
                accessibilityLabel={
                  showCode
                    ? l10n.htmlPreview.showPreview
                    : l10n.htmlPreview.showCode
                }
                testID="html-preview-modal-toggle-code"
                hitSlop={8}
                style={styles.modalHeaderButton}>
                {showCode ? (
                  <BrowserIcon
                    stroke={theme.colors.onSurface}
                    width={22}
                    height={22}
                  />
                ) : (
                  <CodeIcon
                    stroke={theme.colors.onSurface}
                    width={22}
                    height={22}
                  />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={copyHtml}
                accessibilityRole="button"
                accessibilityLabel={l10n.htmlPreview.copyHtml}
                testID="html-preview-modal-copy"
                hitSlop={8}
                style={styles.modalHeaderButton}>
                <CopyIcon
                  stroke={theme.colors.onSurface}
                  width={22}
                  height={22}
                />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setFullscreen(false)}
                accessibilityRole="button"
                accessibilityLabel={l10n.htmlPreview.closePreview}
                testID="html-preview-modal-close"
                hitSlop={8}
                style={styles.modalHeaderButton}>
                <CloseIcon
                  stroke={theme.colors.onSurface}
                  width={22}
                  height={22}
                />
              </TouchableOpacity>
            </View>
            {showCode ? (
              <ScrollView
                style={[styles.modalWebView, styles.codeSurface]}
                testID="html-preview-modal-code">
                <CodeHighlighter
                  hljsStyle={atomOneDark}
                  language="html"
                  textStyle={styles.codeText}
                  scrollViewProps={{
                    style: styles.codeInnerScroll,
                    contentContainerStyle: styles.codeContent,
                  }}>
                  {html}
                </CodeHighlighter>
              </ScrollView>
            ) : (
              <WebView
                source={{html: wrappedHtml, baseUrl: 'about:blank'}}
                javaScriptEnabled={true}
                originWhitelist={['about:blank']}
                onShouldStartLoadWithRequest={req => req.url === 'about:blank'}
                scrollEnabled={true}
                style={styles.modalWebView}
                testID="html-preview-modal-webview"
              />
            )}
          </SafeAreaView>
        </SafeAreaProvider>
      </Modal>
    </View>
  );
};
