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
 */
async function swipeUp(): Promise<void> {
  await swipe({
    startYPercent: 0.7,
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

export const Gestures = {
  getScreenSize,
  swipe,
  swipeDownOnElement,
  swipeDownToClose,
  swipeUp,
  swipeDown,
  swipeToOpenDrawer,
  scrollToElement,
};
