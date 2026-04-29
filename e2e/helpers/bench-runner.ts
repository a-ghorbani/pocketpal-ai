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
import {execSync} from 'child_process';

import {getBenchmarkMatrix} from '../fixtures/benchmark-models';

declare const driver: WebdriverIO.Browser;

export const PACKAGE = 'com.pocketpalai.e2e';
export const REMOTE_DIR = `/sdcard/Android/data/${PACKAGE}/files`;

export const adb = (a: string, u?: string): string =>
  execSync(`adb ${u ? `-s ${u}` : ''} ${a}`, {
    encoding: 'utf8',
    timeout: 60_000,
  }).trim();

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
  adb(`shell mkdir -p ${REMOTE_DIR}`, udid);
  adb(`push ${cfgFile} ${REMOTE_DIR}/bench-config.json`, udid);
  return cfgFile;
}

export async function deepLinkLaunch(): Promise<void> {
  await driver.execute('mobile: deepLink', {
    url: 'pocketpal://e2e/benchmark',
    package: PACKAGE,
  });
}

export function pullLatestReport(outDir: string, udid?: string): string {
  const remote = adb(`shell ls ${REMOTE_DIR}/benchmark-report-*.json`, udid)
    .split('\n')
    .filter(Boolean)
    .sort()
    .slice(-1)[0];
  if (!remote) {
    throw new Error('No benchmark-report-*.json on device');
  }
  const localFile = path.join(outDir, path.basename(remote));
  adb(`pull ${remote} ${localFile}`, udid);
  return localFile;
}

/**
 * Slice -v threadtime lines (MM-DD HH:MM:SS.mmm ...) by the cell window.
 * Lines without a parsable timestamp pass through (multi-line continuations).
 */
export function sliceLogcat(
  lines: string[],
  iso: string,
  wallMs: number,
): string[] {
  const start = new Date(iso).getTime();
  const end = start + wallMs;
  const yr = new Date(iso).getFullYear();
  const re = /^(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})\.(\d{3})/;
  return lines.filter(l => {
    const m = re.exec(l);
    if (!m) {
      return true;
    }
    const ts = Date.UTC(
      yr,
      +m[1] - 1,
      +m[2],
      +m[3],
      +m[4],
      +m[5],
      +m[6],
    );
    return ts >= start - 5000 && ts <= end + 5000;
  });
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
