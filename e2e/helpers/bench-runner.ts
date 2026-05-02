/**
 * Spec-side helpers for benchmark-matrix (BenchmarkRunnerScreen-driven).
 *
 * The screen owns the matrix loop and JSON write; this module supplies the
 * config-builder, deep-link launcher, report puller, and per-row logcat
 * slicer. Kept here (not inlined in the spec) so the spec body stays under
 * the LOC target.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {execFileSync, execSync} from 'child_process';

import {getBenchmarkMatrix} from '../fixtures/benchmark-models';

// `driver` is the global injected by WebdriverIO when the spec runs. The
// WebdriverIO types live only in e2e/node_modules, so the root tsc program
// cannot resolve them when the unit-test suites under scripts/__tests__/
// import this module for the shared `buildConfig` export. Typed loosely so
// both programs compile; the spec gets the strongly-typed `driver` from
// WebdriverIO's own globals at runtime.
declare const driver: any;

export const PACKAGE = 'com.pocketpalai.e2e';
export const REMOTE_DIR = `/sdcard/Android/data/${PACKAGE}/files`;

// argv-style adb invocation. The udid flows in from process.env (E2E_DEVICE_UDID)
// — passing it as its own argv slot ([-s, udid]) makes shell-metacharacter
// injection structurally impossible. Replaces the previous shell-string
// `execSync(\`adb ${...}\`)` call shape (round-1 C4).
export const adb = (udid: string | undefined, ...args: string[]): string => {
  const argv = udid ? ['-s', udid, ...args] : args;
  return execFileSync('adb', argv, {
    encoding: 'utf8',
    timeout: 60_000,
  }).trim();
};

export function buildConfig(matrix: ReturnType<typeof getBenchmarkMatrix>) {
  return {
    models: matrix.models.map(m => ({
      id: m.id,
      hfModelId: `${m.searchQuery.trim().split(/\s+/)[0]}/${m.selectorText}-GGUF`,
      quants: matrix.quants
        .map(q => m.quants?.find(v => v.quant === q))
        .filter((v): v is NonNullable<typeof v> => Boolean(v))
        .map(v => ({quant: v.quant, filename: v.downloadFile})),
    })),
    backends: matrix.backends,
    bench: {pp: 512, tg: 128, pl: 1, nr: 3},
  };
}

export function pushConfig(
  matrix: ReturnType<typeof getBenchmarkMatrix>,
  udid?: string,
): string {
  const cfgFile = path.join(os.tmpdir(), 'pocketpal-bench-config.json');
  fs.writeFileSync(cfgFile, JSON.stringify(buildConfig(matrix), null, 2));
  adb(udid, 'shell', 'mkdir', '-p', REMOTE_DIR);
  adb(udid, 'push', cfgFile, `${REMOTE_DIR}/bench-config.json`);
  return cfgFile;
}

export async function deepLinkLaunch(): Promise<void> {
  await driver.execute('mobile: deepLink', {
    url: 'pocketpal://e2e/benchmark',
    package: PACKAGE,
  });
}

export function pullLatestReport(outDir: string, udid?: string): string {
  // `adb shell ls <pattern>` works with argv (no shell expansion needed —
  // the device-side shell expands the glob). Each token is its own argv
  // slot so neither REMOTE_DIR nor the udid can carry shell metacharacters
  // into the host shell.
  const remote = adb(udid, 'shell', 'ls', `${REMOTE_DIR}/benchmark-report-*.json`)
    .split('\n')
    .filter(Boolean)
    .sort()
    .slice(-1)[0];
  if (!remote) {
    throw new Error('No benchmark-report-*.json on device');
  }
  const localFile = path.join(outDir, path.basename(remote));
  adb(udid, 'pull', remote, localFile);
  return localFile;
}

export function getCommitHash(): string {
  try {
    return execSync('git rev-parse --short HEAD', {
      encoding: 'utf8',
      timeout: 5000,
    }).trim();
  } catch {
    return 'unknown';
  }
}

export function getLlamaRnVersion(): string {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(
        path.resolve(__dirname, '..', '..', 'package.json'),
        'utf8',
      ),
    );
    return (
      pkg.dependencies?.['llama.rn'] ||
      pkg.devDependencies?.['llama.rn'] ||
      'unknown'
    );
  } catch {
    return 'unknown';
  }
}
