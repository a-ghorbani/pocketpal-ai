/**
 * Failure-screenshot capture shared by feature specs.
 */

import * as fs from 'fs';
import * as path from 'path';
import {SCREENSHOT_DIR} from '../wdio.shared.conf';

declare const driver: WebdriverIO.Browser;

/**
 * Mocha titles are free text and reach the filesystem as a filename, so anything
 * that is not filename-safe is folded away — a `/` in a title (e.g. "low/medium/high")
 * otherwise names a directory that does not exist and the capture is silently lost.
 */
function toFileName(title: string): string {
  return title
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

/** Capture a screenshot for a failed test. Never throws. */
export async function saveFailureScreenshot(title: string): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  try {
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, {recursive: true});
    }
    await driver.saveScreenshot(
      path.join(
        SCREENSHOT_DIR,
        `failure-${toFileName(title)}-${timestamp}.png`,
      ),
    );
  } catch (e) {
    console.error('Failed to capture screenshot:', (e as Error).message);
  }
}
