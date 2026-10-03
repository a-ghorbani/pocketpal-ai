/**
 * Reading the real state of a control, rather than inferring it.
 *
 * A `byTestId` lookup matches on a resource-id *substring*, and a paper control
 * expands into several nodes that share the prefix — for a Button: a wrapper,
 * the Button itself, a text node and an icon container. `findElement` returns
 * the first, which is the wrapper, so state read straight off the selector
 * describes the wrapper and not the control.
 */

import {isAndroid} from './selectors';

declare const browser: WebdriverIO.Browser;

/**
 * A switch's real on/off state, or null where the platform does not expose it
 * (the paper Switch reports no usable value on iOS). The element must already
 * be on screen — an off-viewport control is absent from the tree.
 */
export async function readSwitchState(
  selector: string,
): Promise<boolean | null> {
  const checked = await browser
    .$(selector)
    .getAttribute('checked')
    .catch(() => null);
  return checked === null || checked === 'null' ? null : checked === 'true';
}

/**
 * Whether the interactive control behind `selector` is enabled.
 *
 * The wrapper around a disabled Button stays enabled, so reading the first
 * match reports a disabled control as enabled. Read the clickable node instead.
 */
export async function readControlEnabled(selector: string): Promise<boolean> {
  if (!isAndroid()) {
    return browser.$(selector).isEnabled();
  }
  const nodes = await browser.$$(selector);
  for (const node of nodes) {
    const clickable = await node.getAttribute('clickable').catch(() => null);
    if (clickable === 'true') {
      return node.isEnabled();
    }
  }
  return browser.$(selector).isEnabled();
}

/**
 * Tap the interactive node for `selector`, which may be an ancestor of it.
 *
 * A text match usually lands on a TextView, and a testID match on a wrapper —
 * neither is clickable, so the tap is accepted and does nothing. On Android the
 * nearest clickable ancestor-or-self is the control; elsewhere the selector
 * already resolves to it.
 */
export async function tapControl(selector: string): Promise<void> {
  if (isAndroid()) {
    const control = browser.$(
      `${selector}/ancestor-or-self::*[@clickable="true"][1]`,
    );
    if (await control.isExisting().catch(() => false)) {
      await control.click();
      return;
    }
  }
  await browser.$(selector).click();
}
