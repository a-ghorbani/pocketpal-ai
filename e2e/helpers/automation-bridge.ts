declare const driver: WebdriverIO.Browser;

/**
 * Run an Android lookup of the hidden automation-bridge inputs.
 *
 * Those inputs lay out with zero bounds on some phones (OnePlus 6, Redmi 12C),
 * and UiAutomator2 drops zero-size nodes from searches unless
 * allowInvisibleElements is on. It stays off elsewhere so that scroll loops
 * keyed on existence still mean "on screen".
 */
export async function withBridgeElements<T>(fn: () => Promise<T>): Promise<T> {
  await driver.updateSettings({allowInvisibleElements: true});
  try {
    return await fn();
  } finally {
    await driver.updateSettings({allowInvisibleElements: false});
  }
}
