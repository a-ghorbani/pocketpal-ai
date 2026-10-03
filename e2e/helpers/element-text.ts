/**
 * Cross-platform element text reads.
 */

import {isAndroid} from './selectors';

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

/** UiAutomator2 reports an absent attribute as the string "null". */
function normalise(value: string | null): string {
  return !value || value === 'null' ? '' : value;
}
