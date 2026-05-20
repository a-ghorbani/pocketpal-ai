const {execSync} = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SCRIPT_PATH = path.join(__dirname, '..', 'verify-fonts.js');
const ROOT = path.join(__dirname, '..', '..');
const TYPOGRAPHY_PATH = path.join(
  ROOT,
  'src',
  'theme',
  'tokens',
  'typography.ts',
);
const THEME_PATH = path.join(ROOT, 'src', 'utils', 'theme.ts');
const ASSETS_DIR = path.join(ROOT, 'src', 'assets', 'fonts');
const ANDROID_DIR = path.join(
  ROOT,
  'android',
  'app',
  'src',
  'main',
  'assets',
  'fonts',
);
const INFO_PLIST = path.join(ROOT, 'ios', 'PocketPal', 'Info.plist');

/**
 * Run verify-fonts.js against a temp workspace. The temp workspace
 * mirrors the relevant inputs (typography.ts, theme.ts, fonts dirs,
 * Info.plist) so we can introduce mismatches without touching the real
 * project files (which would race with parallel Jest workers).
 */
function runWithOverrides(overrides = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-fonts-test-'));
  try {
    // Replicate the directory layout the script reads.
    fs.mkdirSync(path.join(tmp, 'src', 'theme', 'tokens'), {recursive: true});
    fs.mkdirSync(path.join(tmp, 'src', 'utils'), {recursive: true});
    fs.mkdirSync(path.join(tmp, 'src', 'assets', 'fonts'), {recursive: true});
    fs.mkdirSync(
      path.join(tmp, 'android', 'app', 'src', 'main', 'assets', 'fonts'),
      {recursive: true},
    );
    fs.mkdirSync(path.join(tmp, 'ios', 'PocketPal'), {recursive: true});

    fs.copyFileSync(
      TYPOGRAPHY_PATH,
      path.join(tmp, 'src', 'theme', 'tokens', 'typography.ts'),
    );
    fs.copyFileSync(THEME_PATH, path.join(tmp, 'src', 'utils', 'theme.ts'));
    for (const f of fs.readdirSync(ASSETS_DIR)) {
      fs.copyFileSync(
        path.join(ASSETS_DIR, f),
        path.join(tmp, 'src', 'assets', 'fonts', f),
      );
    }
    for (const f of fs.readdirSync(ANDROID_DIR)) {
      fs.copyFileSync(
        path.join(ANDROID_DIR, f),
        path.join(tmp, 'android', 'app', 'src', 'main', 'assets', 'fonts', f),
      );
    }
    fs.copyFileSync(
      INFO_PLIST,
      path.join(tmp, 'ios', 'PocketPal', 'Info.plist'),
    );

    // Apply overrides — relative paths.
    for (const [relPath, content] of Object.entries(overrides.files || {})) {
      const dest = path.join(tmp, relPath);
      fs.mkdirSync(path.dirname(dest), {recursive: true});
      fs.writeFileSync(dest, content, 'utf-8');
    }
    for (const relPath of overrides.remove || []) {
      const target = path.join(tmp, relPath);
      if (fs.existsSync(target)) {
        fs.unlinkSync(target);
      }
    }

    // Patch the script to point at the temp workspace.
    let scriptSrc = fs.readFileSync(SCRIPT_PATH, 'utf-8');
    scriptSrc = scriptSrc.replace(
      /const ROOT = .+;/,
      `const ROOT = ${JSON.stringify(tmp)};`,
    );
    const tmpScript = path.join(tmp, 'verify-fonts.js');
    fs.writeFileSync(tmpScript, scriptSrc, 'utf-8');

    try {
      const output = execSync(`node "${tmpScript}" 2>&1`, {
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
    fs.rmSync(tmp, {recursive: true, force: true});
  }
}

describe('verify-fonts.js', () => {
  it('passes against the current worktree font set', () => {
    const result = runWithOverrides();
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('Inter-Regular');
    expect(result.output).toContain('Fraunces-Regular');
    expect(result.output).toContain('JetBrainsMono-Regular');
    expect(result.output).toContain('all families bundled on all platforms');
  });

  it('fails when a TTF is missing from src/assets/fonts', () => {
    const result = runWithOverrides({
      remove: ['src/assets/fonts/Fraunces-Regular.ttf'],
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain(
      'Fraunces-Regular: missing src/assets/fonts/Fraunces-Regular.ttf',
    );
  });

  it('fails when a TTF is missing from android assets', () => {
    const result = runWithOverrides({
      remove: ['android/app/src/main/assets/fonts/JetBrainsMono-Medium.ttf'],
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain(
      'JetBrainsMono-Medium: missing android/app/src/main/assets/fonts/JetBrainsMono-Medium.ttf',
    );
  });

  it('fails when a font is missing from ios UIAppFonts', () => {
    // Strip the JetBrainsMono entries from the plist.
    const plistSrc = fs.readFileSync(INFO_PLIST, 'utf-8');
    const stripped = plistSrc
      .split('\n')
      .filter(line => !line.includes('JetBrainsMono'))
      .join('\n');
    const result = runWithOverrides({
      files: {'ios/PocketPal/Info.plist': stripped},
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain(
      'JetBrainsMono-Regular: missing <string>JetBrainsMono-Regular.ttf</string>',
    );
  });

  it('fails when typography.ts references an unknown family', () => {
    // Inject a reference to 'Comic-Sans-Regular' (or any name) by
    // appending a fake constant assignment. The script's regex will pick
    // it up; no asset will satisfy it.
    const src = fs.readFileSync(TYPOGRAPHY_PATH, 'utf-8');
    const injected = src + "\nconst _ignored = 'ComicSans-Regular';\n";
    const result = runWithOverrides({
      files: {'src/theme/tokens/typography.ts': injected},
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain('ComicSans-Regular');
  });
});
