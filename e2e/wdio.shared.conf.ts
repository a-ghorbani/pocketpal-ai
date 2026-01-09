/**
 * Shared WebDriverIO configuration for PocketPal E2E tests
 * TypeScript version with proper types
 */

import type {Options} from '@wdio/types';

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
  reporters: ['spec'],

  mochaOpts: {
    ui: 'bdd',
    timeout: 600000, // 10 minutes - model downloads and inference can be slow
  },
} as Options.Testrunner;
