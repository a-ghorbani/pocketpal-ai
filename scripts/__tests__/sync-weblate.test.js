const {execSync} = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SCRIPT_PATH = path.join(__dirname, '..', 'sync-weblate.js');
const LOCALES_DIR = path.join(__dirname, '..', '..', 'src', 'locales');

const GARBAGE_INDEX = 'export const whatever = 1;';
const ONLY_EN_INDEX = [
  'const languageRegistry = {',
  '  en: {displayName: "English (EN)"},',
  '} as const;',
].join('\n');

/**
 * Run sync-weblate.js against a temporary locale directory.
 *
 * Creates a modified copy of the script that points to the temp directory,
 * writes the given index.ts, and copies en.json plus the lib/ helper so no
 * real locale file is ever touched. The API URL points at an unroutable
 * address, so any request fails fast instead of hanging.
 */
function runWithIndex(indexContent, command) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weblate-test-'));
  const tmpLocalesDir = path.join(tmpDir, 'src', 'locales');
  const indexPath = path.join(tmpLocalesDir, 'index.ts');
  fs.mkdirSync(tmpLocalesDir, {recursive: true});

  try {
    fs.writeFileSync(indexPath, indexContent, 'utf-8');
    fs.copyFileSync(
      path.join(LOCALES_DIR, 'en.json'),
      path.join(tmpLocalesDir, 'en.json'),
    );

    let scriptContent = fs.readFileSync(SCRIPT_PATH, 'utf-8');
    scriptContent = scriptContent.replace(
      /const LOCALES_DIR = .+;/,
      `const LOCALES_DIR = ${JSON.stringify(tmpLocalesDir)};`,
    );
    // The script requires its lib relative to its own location, so the
    // temp copy needs the lib copied alongside it, and a node_modules
    // symlink so require('axios') still resolves.
    fs.mkdirSync(path.join(tmpDir, 'lib'));
    fs.copyFileSync(
      path.join(__dirname, '..', 'lib', 'registry-languages.js'),
      path.join(tmpDir, 'lib', 'registry-languages.js'),
    );
    fs.symlinkSync(
      path.join(__dirname, '..', '..', 'node_modules'),
      path.join(tmpDir, 'node_modules'),
      'dir',
    );
    const tmpScriptPath = path.join(tmpDir, 'sync-weblate.js');
    fs.writeFileSync(tmpScriptPath, scriptContent, 'utf-8');

    try {
      const output = execSync(`node "${tmpScriptPath}" ${command} 2>&1`, {
        encoding: 'utf-8',
        timeout: 10000,
        env: {
          ...process.env,
          WEBLATE_TOKEN: 'dummy',
          WEBLATE_API_URL: 'http://127.0.0.1:1',
        },
      });
      return {exitCode: 0, output, indexPath};
    } catch (e) {
      return {
        exitCode: e.status,
        output: (e.stdout || '') + (e.stderr || ''),
        indexPath,
      };
    }
  } finally {
    fs.rmSync(tmpDir, {recursive: true, force: true});
  }
}

function expectGuarded(result) {
  expect(result.exitCode).toBe(1);
  expect(result.output).toContain(result.indexPath);
  // The guard must fire before any network call: none of uploadSourceFile's
  // outcomes (upload done, upload failed, en.json missing) may print.
  expect(result.output).not.toContain('Uploaded source file');
  expect(result.output).not.toContain('Failed to upload source file');
  expect(result.output).not.toContain('Source file en.json not found');
}

describe('sync-weblate.js registry guard', () => {
  it('download exits 1 before any network call when index.ts is garbage', () => {
    const result = runWithIndex(GARBAGE_INDEX, 'download');
    expectGuarded(result);
    expect(result.output).not.toContain('Downloaded');
  });

  it('sync exits 1 before any network call when index.ts is garbage', () => {
    const result = runWithIndex(GARBAGE_INDEX, 'sync');
    expectGuarded(result);
  });

  it('download exits 1 when the registry yields no wired locales', () => {
    const result = runWithIndex(ONLY_EN_INDEX, 'download');
    expectGuarded(result);
  });

  it('sync exits 1 when the registry yields no wired locales', () => {
    const result = runWithIndex(ONLY_EN_INDEX, 'sync');
    expectGuarded(result);
  });
});
