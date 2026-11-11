/**
 * Cross-platform element text reads.
 */

import {isAndroid} from './selectors';

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
 * The markdown renderer draws one native text view per run of paragraphs and
 * may mount them beside `markdown-content` rather than inside it, so the
 * search covers the whole reply. Android exposes each block's text on virtual
 * nodes that only a descendant query reaches; iOS hides the text views and
 * labels each run instead, which a static-text query does not match.
 */
export async function readReplyText(reply: ChainableElement): Promise<string> {
  const parts: string[] = [];
  if (isAndroid()) {
    for (const node of await reply.$$('.//*')) {
      const text = await node.getText().catch(() => '');
      if (text && text !== parts[parts.length - 1]) {
        parts.push(text);
      }
    }
  } else {
    for (const node of await reply.$$('-ios class chain:**/*')) {
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

/**
 * The text of a footer timing element. On iOS it is the label; on Android the
 * footer's Text carries it as `text` (no wrapper merges it into `content-desc`).
 */
export async function readTimingText(
  element: ChainableElement,
): Promise<string> {
  if (!isAndroid()) {
    return (await element.getAttribute('label').catch(() => '')) || '';
  }
  const label = normalise(
    await element.getAttribute('content-desc').catch(() => null),
  );
  return label || (await element.getText().catch(() => ''));
}

/** UiAutomator2 reports an absent attribute as the string "null". */
function normalise(value: string | null): string {
  return !value || value === 'null' ? '' : value;
}
