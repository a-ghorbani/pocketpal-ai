/**
 * Benchmark Page Object
 *
 * Navigates to the Benchmark screen (via drawer) and drives the start-test
 * button. Used by `benchmark-matrix.spec.ts`; the spec reads results via
 * the BenchmarkResultTrigger (read::latest), NOT via UI scrape.
 */

import {BasePage} from './BasePage';
import {ChatPage} from './ChatPage';
import {DrawerPage} from './DrawerPage';
import {Selectors} from '../helpers/selectors';

declare const browser: WebdriverIO.Browser;

export class BenchmarkPage extends BasePage {
  /**
   * Open drawer and navigate to the Benchmark screen.
   * Expects Chat screen as the starting point (matches the pattern in
   * DrawerPage.navigateToModels / ChatPage.openDrawer).
   */
  async navigate(): Promise<void> {
    const chatPage = new ChatPage();
    const drawerPage = new DrawerPage();

    await chatPage.openDrawer();
    await drawerPage.waitForOpen();
    await this.tap(Selectors.drawer.benchmarkTab);
    await browser.pause(300);
    await drawerPage.waitForClose();
    await this.waitForReady();
  }

  /**
   * Wait for the Benchmark screen to be ready.
   * The start-test button is the only always-visible element on the screen
   * (the result list may be empty on a fresh install).
   */
  async waitForReady(timeout = 10000): Promise<void> {
    await this.waitForElement(Selectors.benchmark.startTestButton, timeout);
  }

  /**
   * Tap the start-test button. Does NOT wait for the result — the spec
   * polls the BenchmarkResultTrigger for a fresh `latestResult` with its
   * own (longer) timeout.
   */
  async startTest(): Promise<void> {
    await this.tap(Selectors.benchmark.startTestButton);
  }
}
