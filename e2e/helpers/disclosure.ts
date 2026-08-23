/**
 * Helpers for driving progressive-disclosure UI (accordions, dependent switches)
 * whose controls may be off-screen.
 */

import {Gestures} from './gestures';
import {readSwitchState} from './control-state';

declare const browser: WebdriverIO.Browser;

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
  const {toggle, dependent, rewind, maxScrolls = 8} = options;
  const reach = options.reach ?? Gestures.scrollToElement;
  const reachForClick = options.reachForClick ?? reach;

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
