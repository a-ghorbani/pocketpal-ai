/**
 * Gesture helpers for E2E tests
 * Provides reusable gesture actions using W3C WebDriver Actions API
 */

// WebdriverIO globals - available during test execution
declare const browser: WebdriverIO.Browser;
declare const driver: WebdriverIO.Browser;

interface SwipeOptions {
  duration?: number;
  startXPercent?: number;
  startYPercent?: number;
  endXPercent?: number;
  endYPercent?: number;
}

interface ScreenSize {
  width: number;
  height: number;
}

// Element interface for gesture methods - must be compatible with awaited WebdriverIO elements
interface ElementLike {
  getLocation(): Promise<{x: number; y: number}>;
  getSize(): Promise<{width: number; height: number}>;
}

/**
 * Get the current screen dimensions
 */
async function getScreenSize(): Promise<ScreenSize> {
  return driver.getWindowSize();
}

/**
 * Perform a swipe gesture using percentage-based coordinates
 * This is more reliable than hardcoded pixel values across different devices
 */
async function swipe(options: SwipeOptions = {}): Promise<void> {
  const {
    duration = 500,
    startXPercent = 0.5,
    startYPercent = 0.5,
    endXPercent = 0.5,
    endYPercent = 0.5,
  } = options;

  const {width, height} = await getScreenSize();

  const startX = Math.floor(width * startXPercent);
  const startY = Math.floor(height * startYPercent);
  const endX = Math.floor(width * endXPercent);
  const endY = Math.floor(height * endYPercent);

  await driver.performActions([
    {
      type: 'pointer',
      id: 'finger1',
      parameters: {pointerType: 'touch'},
      actions: [
        {type: 'pointerMove', duration: 0, x: startX, y: startY},
        {type: 'pointerDown', button: 0},
        {type: 'pause', duration: 100},
        {type: 'pointerMove', duration, x: endX, y: endY},
        {type: 'pointerUp', button: 0},
      ],
    },
  ]);
  await driver.releaseActions();
}

/**
 * Swipe down on an element to close a bottom sheet
 * Starts from the center of the element and swipes to bottom of screen
 *
 * @param element - The element to swipe on (e.g., sheet handle)
 */
async function swipeDownOnElement(element: ElementLike): Promise<void> {
  const location = await element.getLocation();
  const size = await element.getSize();
  const {height: screenHeight} = await getScreenSize();

  // Start from the center of the element
  const startX = Math.floor(location.x + size.width / 2);
  const startY = Math.floor(location.y + size.height / 2);
  const endY = Math.floor(screenHeight * 0.9);

  await driver.performActions([
    {
      type: 'pointer',
      id: 'finger1',
      parameters: {pointerType: 'touch'},
      actions: [
        {type: 'pointerMove', duration: 0, x: startX, y: startY},
        {type: 'pointerDown', button: 0},
        {type: 'pause', duration: 200},
        {type: 'pointerMove', duration: 300, x: startX, y: endY},
        {type: 'pointerUp', button: 0},
      ],
    },
  ]);
  await driver.releaseActions();
}

/**
 * Swipe down to close a bottom sheet (fallback when element not available)
 * Uses percentage-based coordinates for cross-device compatibility
 */
async function swipeDownToClose(startYPercent = 0.1): Promise<void> {
  await swipe({
    startYPercent,
    endYPercent: 0.85,
    duration: 500,
  });
  // Allow animation to complete
  await driver.pause(500);
}

/**
 * Swipe up (for scrolling down content)
 * Uses safe Y coordinates to avoid triggering Android gesture navigation
 */
async function swipeUp(): Promise<void> {
  await swipe({
    // Start higher up to avoid Android gesture bar area
    startYPercent: 0.6,
    endYPercent: 0.3,
    duration: 300,
  });
}

/**
 * Swipe down (for scrolling up content)
 */
async function swipeDown(): Promise<void> {
  await swipe({
    startYPercent: 0.3,
    endYPercent: 0.7,
    duration: 300,
  });
}

/**
 * Swipe from left edge to open drawer
 */
async function swipeToOpenDrawer(): Promise<void> {
  await swipe({
    startXPercent: 0.02,
    endXPercent: 0.7,
    startYPercent: 0.5,
    endYPercent: 0.5,
    duration: 300,
  });
}

/**
 * Scroll an element into view
 * @param selector - Element selector to scroll to
 * @param maxScrolls - Maximum number of scroll attempts
 */
async function scrollToElement(
  selector: string,
  maxScrolls = 5,
): Promise<boolean> {
  for (let i = 0; i < maxScrolls; i++) {
    try {
      const element = await browser.$(selector);
      if (await element.isDisplayed()) {
        return true;
      }
    } catch {
      // Element not found yet
    }
    await swipeUp();
    await driver.pause(300);
  }
  return false;
}

/**
 * Scroll to a control with UiAutomator's own scroller, which walks the whole
 * container in either direction rather than the viewport. Android only;
 * returns false elsewhere so callers can fall back to a swipe loop.
 *
 * Only for a control known to be mounted — a miss scrolls to the end of the
 * list before failing, which costs tens of seconds.
 */
async function nativeScrollIntoView(selector: string): Promise<boolean> {
  if (!(browser as unknown as {isAndroid?: boolean}).isAndroid) {
    return false;
  }
  const match = selector.match(/contains\(@resource-id, "([^"]+)"\)/);
  if (!match) {
    return false;
  }
  try {
    return await browser
      .$(
        '-android uiautomator:new UiScrollable(new UiSelector().scrollable(true))' +
          `.scrollIntoView(new UiSelector().resourceIdMatches(".*${match[1]}.*"))`,
      )
      .isExisting();
  } catch {
    return false;
  }
}

/**
 * Swipe up within a bottom sheet (uses safer coordinates)
 * Avoids the bottom navigation gesture area on Android
 */
async function swipeUpInSheet(): Promise<void> {
  await swipe({
    // Use middle section of screen to avoid Android gesture bar
    startYPercent: 0.55,
    endYPercent: 0.25,
    duration: 300,
  });
}

/**
 * Scroll within a sheet until the target element is fully inside a
 * "safe viewport" — the screen minus a bottom reserve that accounts for
 * fixed UI like Sheet.Actions (Cancel/Create), tab bars, system
 * navigation. UIAutomator2 reports `isDisplayed=true` for elements
 * whose bounds intersect the screen even when those elements are
 * z-occluded by a fixed action bar painted on top, which on Android
 * causes taps to hit the overlay instead of the intended element. By
 * requiring the element's bottom edge to be above the safe area, we
 * scroll past the overlay before clicking.
 *
 * @param selector - Element selector to scroll to
 * @param maxScrolls - Maximum number of scroll attempts
 * @param bottomReservePct - Fraction of screen height (0–1) reserved
 *   for the bottom-anchored UI. Defaults to 0.15 (~15%), enough for a
 *   Sheet.Actions row plus system nav on Android. Pass a larger value
 *   when scrolling inside a sheet with a tall action area.
 *
 * The reserve is a guess, and it rejects an element that is genuinely the LAST
 * item in the sheet and so can never be scrolled above it — the caller then
 * sees an unreachable element rather than an obvious failure. Prefer
 * `scrollInSheetClearOfOverlay`, which measures the pinned row instead.
 */
async function scrollInSheetToElement(
  selector: string,
  maxScrolls = 5,
  bottomReservePct = 0.15,
): Promise<boolean> {
  const screen = await driver.getWindowSize();
  const safeMaxY = Math.floor(screen.height * (1 - bottomReservePct));
  for (let i = 0; i < maxScrolls; i++) {
    try {
      const element = await browser.$(selector);
      if (await element.isDisplayed()) {
        const loc = await element.getLocation();
        const size = await element.getSize();
        if (loc.y >= 0 && loc.y + size.height <= safeMaxY) {
          return true;
        }
      }
    } catch {
      // Element not found yet
    }
    await swipeUpInSheet();
    await driver.pause(300);
  }
  return false;
}

/**
 * Swipe up within a bottom sheet, starting low enough to miss the text inputs
 * that occupy the middle of a form sheet. A drag begun on a TextInput is
 * consumed by it, so the sheet never scrolls and the caller sees an unreachable
 * row rather than a failed gesture.
 */
async function swipeUpInSheetBelowInputs(): Promise<void> {
  await swipe({
    startYPercent: 0.78,
    endYPercent: 0.42,
    duration: 300,
  });
}

/**
 * Scroll within a sheet until `selector` sits fully above `overlay`.
 *
 * Use for anything about to be tapped inside a sheet with a pinned action row.
 * UiAutomator2 reports an element displayed while that row is painted over it,
 * so the tap lands on the overlay instead. The percentage-based reserve in
 * scrollInSheetToElement has to be guessed per layout and per device — and a
 * row that is genuinely the last item can sit inside the reserve with nothing
 * left to scroll. The overlay's own geometry is exact.
 *
 * Probes by existence: sheet content reports isDisplayed=false on iOS.
 */
async function scrollInSheetClearOfOverlay(
  selector: string,
  overlay: string,
  maxScrolls = 8,
  scroll: () => Promise<void> = swipeUpInSheet,
): Promise<boolean> {
  for (let i = 0; i < maxScrolls; i++) {
    const element = browser.$(selector);
    if (await element.isExisting().catch(() => false)) {
      const loc = await element.getLocation();
      const size = await element.getSize();
      const overlayEl = browser.$(overlay);
      const overlayTop = (await overlayEl.isExisting().catch(() => false))
        ? (await overlayEl.getLocation()).y
        : (await getScreenSize()).height;
      if (loc.y >= 0 && loc.y + size.height <= overlayTop) {
        return true;
      }
    }
    await scroll();
    await driver.pause(300);
  }
  return false;
}

/**
 * Scroll within a sheet to find an element using isExisting instead of isDisplayed
 * This is more reliable on iOS where elements in sheets report isDisplayed=false
 * @param selector - Element selector to scroll to
 * @param maxScrolls - Maximum number of scroll attempts
 */
async function scrollInSheetToElementExists(
  selector: string,
  maxScrolls = 5,
): Promise<boolean> {
  for (let i = 0; i < maxScrolls; i++) {
    try {
      const element = await browser.$(selector);
      if (await element.isExisting()) {
        return true;
      }
    } catch {
      // Element not found yet
    }
    await swipeUpInSheet();
    await driver.pause(300);
  }
  return false;
}

export const Gestures = {
  getScreenSize,
  nativeScrollIntoView,
  swipe,
  swipeDownOnElement,
  swipeDownToClose,
  swipeUp,
  swipeDown,
  swipeToOpenDrawer,
  scrollToElement,
  swipeUpInSheet,
  swipeUpInSheetBelowInputs,
  scrollInSheetToElement,
  scrollInSheetClearOfOverlay,
  scrollInSheetToElementExists,
};
