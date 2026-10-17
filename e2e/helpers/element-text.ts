/**
 * Cross-platform element text reads.
 */

import {byTestId, isAndroid} from './selectors';

type ChainableElement = ReturnType<WebdriverIO.Browser['$']>;

declare const browser: WebdriverIO.Browser;

/**
 * The element's accessibility label.
 *
 * Use this for controls that carry an explicit `accessibilityLabel` (buttons,
 * pills, pickers): Android exposes it as `content-desc` and leaves the node's
 * own `text` empty, so `getText()` returns "" for them. Plain `<Text>` is the
 * other way round — read those with `getText()`.
 *
 * `label` is an iOS-only attribute; asking for it on Android throws.
 *
 * A `byTestId` lookup matches on a resource-id *substring*, so it can resolve a
 * wrapper that carries no label while the labelled control is its descendant;
 * the wrapper is searched first, then the subtree.
 */
export async function readAccessibilityLabel(
  selector: string,
): Promise<string> {
  const attr = isAndroid() ? 'content-desc' : 'label';
  const element = browser.$(selector);

  const own = normalise(await element.getAttribute(attr).catch(() => null));
  if (own) {
    return own;
  }

  if (!isAndroid()) {
    return '';
  }
  try {
    const descendants = await element.$$('.//*[@content-desc]');
    for (const descendant of descendants) {
      const label = normalise(
        await descendant.getAttribute(attr).catch(() => null),
      );
      if (label) {
        return label;
      }
    }
  } catch {
    // Element gone or subtree unreadable; an empty label is the honest answer.
  }
  return '';
}

/**
 * The rendered text of a chat reply, joined with newlines.
 *
 * The markdown renderer splits a reply into one native text view per run of
 * paragraphs, so a single text-element read returns only the first run.
 * Android mounts those views beside the `markdown-content` container rather
 * than inside it, and exposes each block's text on virtual child nodes while
 * the view's own text is empty. On iOS the text views are hidden from
 * accessibility and each run is a labelled element that a static-text query
 * does not match.
 */
export async function readReplyText(reply: ChainableElement): Promise<string> {
  const parts: string[] = [];
  if (isAndroid()) {
    for (const view of await reply.$$('.//android.widget.TextView')) {
      const own = await view.getText();
      if (own) {
        parts.push(own);
        continue;
      }
      for (const node of await view.$$('./*')) {
        const text = await node.getText();
        if (text) {
          parts.push(text);
        }
      }
    }
  } else {
    const markdown = reply.$(byTestId('markdown-content'));
    for (const node of await markdown.$$('-ios class chain:**/*')) {
      const label = normalise(
        await node.getAttribute('label').catch(() => null),
      );
      if (label && label !== parts[parts.length - 1]) {
        parts.push(label);
      }
    }
  }
  return parts.join('\n');
}

/** UiAutomator2 reports an absent attribute as the string "null". */
function normalise(value: string | null): string {
  return !value || value === 'null' ? '' : value;
}
