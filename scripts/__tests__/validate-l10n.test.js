const fs = require('fs');
const path = require('path');

const {validateL10n} = require('../validate-l10n');

const LOCALES_DIR = path.join(__dirname, '..', '..', 'src', 'locales');
const TMP_ROOT = path.join(__dirname, '.tmp');

function createLogger() {
  const messages = [];

  const push = (level, args) => {
    const text = args
      .map(arg => (arg instanceof Error ? arg.message : String(arg)))
      .join(' ');
    messages.push({level, text});
  };

  return {
    logger: {
      log: (...args) => push('log', args),
      warn: (...args) => push('warn', args),
      error: (...args) => push('error', args),
    },
    getOutput: () => messages.map(entry => entry.text).join('\n'),
  };
}

function runWithLocales(overrides = {}) {
  fs.mkdirSync(TMP_ROOT, {recursive: true});
  const tmpDir = fs.mkdtempSync(path.join(TMP_ROOT, 'l10n-test-'));
  const tmpLocalesDir = path.join(tmpDir, 'locales');
  fs.mkdirSync(tmpLocalesDir);

  try {
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
      fs.copyFileSync(
        path.join(LOCALES_DIR, filename),
        path.join(tmpLocalesDir, filename),
      );
    }

    for (const [filename, content] of Object.entries(overrides)) {
      fs.writeFileSync(path.join(tmpLocalesDir, filename), content, 'utf-8');
    }

    const {logger, getOutput} = createLogger();
    const exitCode = validateL10n({localesDir: tmpLocalesDir, logger});
    return {exitCode, output: getOutput()};
  } finally {
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
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('missing keys');
  });

  it('fails on placeholder mismatch', () => {
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
    const result = runWithLocales();
    const enValidLines = result.output
      .split('\n')
      .filter(line => line.includes('en.json: valid JSON'));
    expect(enValidLines).toHaveLength(1);
  });
});
