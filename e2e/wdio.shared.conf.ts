/**
 * Shared WebDriverIO configuration for PocketPal E2E tests
 * TypeScript version with proper types
 */

import type {Options} from '@wdio/types';

// Output directories - use Device Farm paths when available
export const OUTPUT_DIR =
  process.env.DEVICEFARM_LOG_DIR || './debug-output';
export const SCREENSHOT_DIR =
  process.env.DEVICEFARM_SCREENSHOT_PATH || './debug-output/screenshots';

export const config: Options.Testrunner = {
  runner: 'local',
  specs: ['./specs/**/*.spec.ts'],
  exclude: [],
  maxInstances: 1,

  autoCompileOpts: {
    autoCompile: true,
    tsNodeOpts: {
      project: './tsconfig.json',
      transpileOnly: true,
    },
  },

  logLevel: 'info',
  bail: 0,
  waitforTimeout: 30000,
  // A real iOS device bootstraps WebDriverAgent on first use, which regularly
  // outruns the default and fails session creation before the app is reached.
  connectionRetryTimeout: Number(process.env.E2E_CONNECTION_TIMEOUT) || 120000,
  connectionRetryCount: 3,

  framework: 'mocha',
  reporters: [
    'spec',
    [
      'junit',
      {
        outputDir: OUTPUT_DIR,
        outputFileFormat: () => {
          // Use model ID from TEST_MODELS env var for unique filenames
          const modelId = process.env.TEST_MODELS?.replace(/[^a-zA-Z0-9.-]/g, '-') || 'unknown';
          return `junit-${modelId}.xml`;
        },
      },
    ],
  ],

  mochaOpts: {
    ui: 'bdd',
    // 10 minutes - model downloads and inference can be slow. A per-test
    // this.timeout() does not override this, so specs that pull multi-GB
    // fixtures onto a real device raise it through the environment instead.
    timeout: Number(process.env.E2E_MOCHA_TIMEOUT) || 600000,
  },
} as Options.Testrunner;
