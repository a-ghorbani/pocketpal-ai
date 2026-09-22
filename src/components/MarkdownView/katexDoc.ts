/**
 * Shared offline-KaTeX document builders for math WebViews.
 *
 * Both `LatexBlock` (single display formula) and `MathParagraphView` (a
 * paragraph with in-flow inline math) render static, pre-rendered HTML:
 * all CSS — including base64 woff2 fonts — is inlined, nothing is fetched,
 * and navigation is pinned to about:blank. WebView JS runs only the
 * measure script so views size to content.
 */
import {marked} from 'marked';
import {renderToString} from 'katex';

import {splitTextWithMath} from '../../utils/latex';

import {KATEX_CSS} from './katexCss';

export interface MeasuredSize {
  height: number;
  width: number;
}

export const MIN_PARAGRAPH_HEIGHT = 64;
export const MIN_BLOCK_MATH_HEIGHT = 52;
export const MIN_INLINE_MATH_HEIGHT = 30;
export const MAX_WEBVIEW_HEIGHT = 480;
const MAX_CACHE_ENTRIES = 200;

// Reports content size back through onMessage so the WebView can size to
// the rendered content instead of a fixed height (tall fractions, matrices
// and multi-line paragraphs would otherwise clip).
export const MEASURE_SCRIPT = `
(function() {
  function postSize() {
    var root = document.getElementById('katex-root') || document.body;
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

export function hashText(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) % 2147483647;
  }
  return Math.abs(hash).toString(36);
}

export function clampMeasuredSize(
  size: Partial<MeasuredSize>,
  opts: {minHeight: number; maxWidth: number; fullWidth: boolean},
): MeasuredSize {
  const width = Math.max(1, Math.ceil(size.width || opts.maxWidth));
  const height = Math.min(
    MAX_WEBVIEW_HEIGHT,
    Math.max(opts.minHeight, Math.ceil(size.height || opts.minHeight)),
  );
  return {
    width: opts.fullWidth
      ? Math.max(opts.maxWidth, width)
      : Math.min(opts.maxWidth, width),
    height,
  };
}

const sizeCache = new Map<string, MeasuredSize>();

export function getCachedMathSize(key: string): MeasuredSize | undefined {
  return sizeCache.get(key);
}

export function setCachedMathSize(key: string, size: MeasuredSize): void {
  if (sizeCache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = sizeCache.keys().next().value;
    if (firstKey) {
      sizeCache.delete(firstKey);
    }
  }
  sizeCache.set(key, size);
}

/** Pre-render TeX to static HTML on the JS thread. Undefined => fallback. */
export function renderTexToHtml(
  tex: string,
  displayMode: boolean,
): string | undefined {
  try {
    const html = renderToString(tex, {
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

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface KatexDocColors {
  text: string;
  background: string;
  link: string;
  codeBackground: string;
}

/**
 * Full standalone document for a math WebView. KaTeX CSS (with local fonts)
 * plus a small base typography layer so markdown around inline math keeps
 * app-like styling (body 16px, scaled headings, themed links/code).
 */
export function buildKatexDoc(
  bodyHtml: string,
  colors: KatexDocColors,
  opts?: {center?: boolean; pad?: string},
): string {
  const center = opts?.center ?? false;
  const pad = opts?.pad ?? '6px 10px';
  return `<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>
${KATEX_CSS}
html, body {
  background: ${colors.background};
  color: ${colors.text};
  margin: 0;
  padding: 0;
  overflow: hidden;
}
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 16px;
  line-height: 1.5;
}
#katex-root {
  box-sizing: border-box;
  color: ${colors.text};
  padding: ${pad};
  text-align: ${center ? 'center' : 'left'};
}
#katex-root > :first-child { margin-top: 0; }
#katex-root > :last-child { margin-bottom: 0; }
.katex { color: ${colors.text}; font-size: 1em; }
.katex-display { margin: 0; }
p { margin: 0.35em 0; }
h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin: 0.4em 0; }
h1 { font-size: 1.5em; } h2 { font-size: 1.3em; } h3 { font-size: 1.15em; }
h4, h5, h6 { font-size: 1em; }
a { color: ${colors.link}; }
code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.9em;
  background: ${colors.codeBackground};
  padding: 1px 4px;
  border-radius: 4px;
}
pre {
  background: ${colors.codeBackground};
  padding: 8px;
  border-radius: 6px;
  overflow-x: auto;
}
pre code { background: none; padding: 0; }
blockquote {
  border-left: 3px solid ${colors.link};
  margin: 0.4em 0;
  padding: 0.1em 0 0.1em 0.7em;
}
ul, ol { margin: 0.35em 0; padding-left: 1.4em; }
li { margin: 0.15em 0; }
img, video, iframe, audio { display: none !important; }
</style>
</head>
<body>
<main id="katex-root">${bodyHtml}</main>
</body>
</html>`;
}

const MATH_TOKEN_RE = /<!--ppmath-(\d+)-->/g;

/**
 * Render one flow paragraph (markdown possibly containing inline math)
 * into standalone body HTML. Math is segmented first so `marked` never
 * sees TeX (it would mangle `_`, `*`, `[` inside formulas); each formula
 * is substituted back as pre-rendered KaTeX, or as `<code>` when KaTeX
 * rejects it. Returns the math formula count for WebView budgeting.
 */
export function renderParagraphHtml(raw: string): {
  html: string;
  mathCount: number;
} {
  const segments = splitTextWithMath(raw);
  let mathIndex = 0;
  let withTokens = '';
  const texList: Array<{tex: string; displayMode: boolean; raw: string}> = [];
  for (const seg of segments) {
    if (seg.type === 'math') {
      withTokens += `<!--ppmath-${mathIndex}-->`;
      texList.push({
        tex: seg.content,
        displayMode: seg.displayMode,
        raw: seg.raw,
      });
      mathIndex++;
    } else {
      withTokens += seg.content;
    }
  }
  let html = marked(withTokens) as string;
  texList.forEach((entry, i) => {
    const rendered = renderTexToHtml(entry.tex, entry.displayMode);
    const replacement = rendered ?? `<code>${escapeHtml(entry.raw)}</code>`;
    html = html.replace(`<!--ppmath-${i}-->`, replacement);
  });
  // Defensive: tokens must never leak to the screen.
  html = html.replace(MATH_TOKEN_RE, '');
  return {html, mathCount: texList.length};
}
