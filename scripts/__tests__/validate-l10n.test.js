const {execSync} = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SCRIPT_PATH = path.join(__dirname, '..', 'validate-l10n.js');
const LOCALES_DIR = path.join(__dirname, '..', '..', 'src', 'locales');

/**
 * Run the validate-l10n.js script against a temporary locale directory.
 * This avoids modifying the real locale files (which would cause race conditions
 * when Jest runs tests in parallel).
 *
 * Creates a modified copy of the script that points to the temp directory,
 * copies the locale files there, applies any overrides, and runs.
 */
function runWithLocales(overrides = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'l10n-test-'));
  const tmpLocalesDir = path.join(tmpDir, 'locales');
  fs.mkdirSync(tmpLocalesDir);

  try {
    // Copy original locale files to temp dir
    for (const filename of [
      'en.json',
      'fa.json',
      'he.json',
      'id.json',
      'ja.json',
      'ko.json',
      'ms.json',
      'ru.json',
      'zh.json',
    ]) {
      const src = path.join(LOCALES_DIR, filename);
      const dest = path.join(tmpLocalesDir, filename);
      fs.copyFileSync(src, dest);
    }

    // Apply overrides
    for (const [filename, content] of Object.entries(overrides)) {
      const dest = path.join(tmpLocalesDir, filename);
      fs.writeFileSync(dest, content, 'utf-8');
    }

    // Create a modified copy of the script that points to the temp dir
    let scriptContent = fs.readFileSync(SCRIPT_PATH, 'utf-8');
    scriptContent = scriptContent.replace(
      /const LOCALES_DIR = .+;/,
      `const LOCALES_DIR = ${JSON.stringify(tmpLocalesDir)};`,
    );
    scriptContent = scriptContent.replace(
      /const EN_PATH = .+;/,
      `const EN_PATH = ${JSON.stringify(path.join(tmpLocalesDir, 'en.json'))};`,
    );
    const tmpScriptPath = path.join(tmpDir, 'validate-l10n.js');
    fs.writeFileSync(tmpScriptPath, scriptContent, 'utf-8');

    // Run the modified script
    try {
      const output = execSync(`node "${tmpScriptPath}" 2>&1`, {
        encoding: 'utf-8',
        timeout: 10000,
      });
      return {exitCode: 0, output};
    } catch (e) {
      return {
        exitCode: e.status,
        output: (e.stdout || '') + (e.stderr || ''),
      };
    }
  } finally {
    // Clean up temp directory
    fs.rmSync(tmpDir, {recursive: true, force: true});
  }
}

describe('validate-l10n.js', () => {
  it('passes with valid locale files', () => {
    const result = runWithLocales();
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('en.json: valid JSON');
    expect(result.output).toContain('fa.json: valid JSON');
    expect(result.output).toContain('he.json: valid JSON');
    expect(result.output).toContain('id.json: valid JSON');
    expect(result.output).toContain('ja.json: valid JSON');
    expect(result.output).toContain('ko.json: valid JSON');
    expect(result.output).toContain('ms.json: valid JSON');
    expect(result.output).toContain('ru.json: valid JSON');
    expect(result.output).toContain('zh.json: valid JSON');
    expect(result.output).toContain('All l10n files valid');
  });

  it('reports the number of keys in en.json', () => {
    const result = runWithLocales();
    expect(result.output).toMatch(/en\.json: \d+ keys/);
  });

  it('fails on invalid JSON in ja.json', () => {
    const result = runWithLocales({
      'ja.json': '{ invalid json content',
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain('INVALID JSON');
  });

  it('fails on invalid JSON in zh.json', () => {
    const result = runWithLocales({
      'zh.json': '{ "unclosed": ',
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain('INVALID JSON');
  });

  it('warns about missing keys in translation files', () => {
    const result = runWithLocales({
      'ja.json': JSON.stringify({common: {cancel: 'test'}}),
    });
    // Missing keys are warnings, not errors -- script should still pass
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('missing keys');
  });

  it('fails on placeholder mismatch', () => {
    // en.json has storage.lowStorage with {{modelSize}} and {{freeSpace}}
    // Create ja.json with a wrong placeholder at that path
    const enData = JSON.parse(
      fs.readFileSync(path.join(LOCALES_DIR, 'en.json'), 'utf-8'),
    );
    const jaModified = JSON.parse(JSON.stringify(enData));
    jaModified.storage.lowStorage = 'wrong {{wrong}} > {{freeSpace}}';

    const result = runWithLocales({
      'ja.json': JSON.stringify(jaModified),
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain('placeholder mismatch');
  });

  it('passes when translation file has identical placeholders to en', () => {
    const enContent = fs.readFileSync(
      path.join(LOCALES_DIR, 'en.json'),
      'utf-8',
    );
    const result = runWithLocales({
      'ja.json': enContent,
    });
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('All l10n files valid');
  });

  it('falls back to auto-discovery when index.ts is absent', () => {
    // Without index.ts in the temp dir, the script falls back to
    // filesystem scanning and picks up any .json file present.
    const enContent = fs.readFileSync(
      path.join(LOCALES_DIR, 'en.json'),
      'utf-8',
    );
    const result = runWithLocales({
      'ko.json': enContent,
    });
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('ko.json: valid JSON');
    expect(result.output).toContain('All l10n files valid');
  });

  it('falls back to auto-discovery and reports errors', () => {
    const result = runWithLocales({
      'ko.json': '{ invalid json',
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain('ko.json');
    expect(result.output).toContain('INVALID JSON');
  });

  it('does not validate en.json as a non-en language file', () => {
    // en.json should only appear as the base reference, not as a target
    // The auto-discovery filters out en.json from the language list
    const result = runWithLocales();
    // en.json should appear exactly once as the base, not as a validated language
    const enValidLines = result.output
      .split('\n')
      .filter(line => line.includes('en.json: valid JSON'));
    expect(enValidLines).toHaveLength(1);
  });
});
