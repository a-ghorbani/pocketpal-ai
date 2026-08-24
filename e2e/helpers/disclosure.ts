/**
 * Helpers for driving progressive-disclosure UI (accordions, dependent switches)
 * whose controls may be off-screen.
 */

import {Gestures} from './gestures';
import {readSwitchState} from './control-state';
import {isAndroid} from './selectors';

declare const browser: WebdriverIO.Browser;

/**
 * React Native's touch responder is not armed immediately after a scroll
 * gesture: the tap is accepted, and silently does nothing. Without this pause
 * the accordion toggle drops every tap.
 */
const TOUCH_SETTLE_MS = 700;

function testIdFrom(selector: string): string | null {
  const match = selector.match(/contains\(@resource-id, "([^"]+)"\)/);
  return match ? match[1] : null;
}

/**
 * Anchor on the toggle, which is always mounted, and read the section's state
 * from `stateProbe` in place. That avoids both the ambiguous off-viewport probe
 * and the cost of a native scroll for a control that may not exist yet.
 */
async function revealViaNativeScroll(
  toggle: string,
  dependent: string,
  stateProbe: string,
): Promise<boolean> {
  if (!(await Gestures.nativeScrollIntoView(toggle))) {
    return false;
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    if (await browser.$(stateProbe).isExisting()) {
      return Gestures.nativeScrollIntoView(dependent);
    }
    await browser.pause(TOUCH_SETTLE_MS);
    await browser.$(toggle).click();
    await browser.pause(TOUCH_SETTLE_MS);
    await Gestures.nativeScrollIntoView(toggle);
  }
  return false;
}

export interface RevealOptions {
  /** Control that opens/closes the section. */
  toggle: string;
  /** Control that is only mounted while the section is open. */
  dependent: string;
  /** Rewind the scroll container so a pass starts from a known offset. */
  rewind?: () => Promise<void>;
  /** Scroll strategy for probing; use `Gestures.scrollInSheetToElementExists` inside a sheet. */
  reach?: (selector: string, maxScrolls?: number) => Promise<boolean>;
  /**
   * Scroll strategy for a control that will be CLICKED. Must clear fixed
   * overlays: UiAutomator2 calls an element displayed while a pinned action bar
   * is painted over it, and the tap then lands on the overlay — inside a sheet
   * that means hitting Cancel and dismissing it. Defaults to `reach`.
   */
  reachForClick?: (selector: string, maxScrolls?: number) => Promise<boolean>;
  maxScrolls?: number;
  /**
   * Control mounted directly under `toggle` while the section is open, used as
   * an in-place state read. Supplying it selects the native-scroll path on
   * Android; without it the scroll-probe fallback is used.
   */
  stateProbe?: string;
}

/**
 * Bring `dependent` into reach, clicking `toggle` only after a full scroll pass
 * has failed to find it.
 *
 * Off-viewport content is absent from the Android accessibility tree, so an
 * existence probe cannot tell "the section is closed" from "the row is below the
 * fold". `toggle` flips state, so acting on that false negative closes a section
 * that was already open — the caller then waits for a control it just unmounted.
 */
export async function ensureRevealed(options: RevealOptions): Promise<boolean> {
  const {toggle, dependent, stateProbe, rewind, maxScrolls = 8} = options;
  const reach = options.reach ?? Gestures.scrollToElement;
  const reachForClick = options.reachForClick ?? reach;

  if (isAndroid() && stateProbe && testIdFrom(toggle)) {
    return revealViaNativeScroll(toggle, dependent, stateProbe);
  }

  await rewind?.();
  if (await reach(dependent, maxScrolls)) {
    return true;
  }

  await rewind?.();
  if (!(await reachForClick(toggle, maxScrolls))) {
    return false;
  }
  await browser.$(toggle).click();
  await browser.pause(600);

  await rewind?.();
  return reach(dependent, maxScrolls);
}

/**
 * Turn `toggle` on and bring `dependent` into reach.
 *
 * Preferred over `ensureRevealed` for switches: Android reports the real state
 * as `checked`, so nothing has to be inferred and both scrolls run in the same
 * direction. Falls back to inference only where the state is unreadable.
 */
export async function ensureSwitchOn(options: RevealOptions): Promise<boolean> {
  const {toggle, dependent, rewind, maxScrolls = 8} = options;
  const reach = options.reach ?? Gestures.scrollToElement;
  const reachForClick = options.reachForClick ?? reach;

  await rewind?.();
  if (await reachForClick(toggle, maxScrolls)) {
    const state = await readSwitchState(toggle);
    if (state !== null) {
      if (!state) {
        await browser.$(toggle).click();
        await browser.pause(600);
      }
      return reach(dependent, maxScrolls);
    }
  }
  return ensureRevealed(options);
}
