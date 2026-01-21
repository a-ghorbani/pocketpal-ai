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
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,

  framework: 'mocha',
  reporters: [
    'spec',
    [
      'junit',
      {
        outputDir: OUTPUT_DIR,
        outputFileFormat: () => 'junit-results.xml',
      },
    ],
  ],

  mochaOpts: {
    ui: 'bdd',
    timeout: 600000, // 10 minutes - model downloads and inference can be slow
  },
} as Options.Testrunner;
