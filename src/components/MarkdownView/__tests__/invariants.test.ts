import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..', '..', '..', '..');
const SRC = path.join(ROOT, 'src');

const listSources = (dir: string, out: string[] = []): string[] => {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    if (entry.name === '__tests__' || entry.name === '__mocks__') {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listSources(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
};

const importers = (pkg: RegExp) =>
  listSources(SRC)
    .filter(file => pkg.test(fs.readFileSync(file, 'utf8')))
    .map(file => path.relative(SRC, file));

const pkgJson = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
);
const allDeps = {...pkgJson.dependencies, ...pkgJson.devDependencies};

describe('markdown renderer invariants', () => {
  it('keeps every import of the renderer inside MarkdownView', () => {
    const markdownViewDir = path.join('components', 'MarkdownView') + path.sep;
    const files = importers(/from\s+['"]react-native-enriched-markdown['"]/);

    expect(files.length).toBeGreaterThan(0);
    expect(files.filter(file => !file.startsWith(markdownViewDir))).toEqual([]);
  });

  it('renders the renderer from MarkdownView.tsx alone', () => {
    expect(
      importers(
        /import\s+(?!type\b)[^;]*from\s+['"]react-native-enriched-markdown['"]/,
      ),
    ).toEqual([path.join('components', 'MarkdownView', 'MarkdownView.tsx')]);
  });

  it('enables code highlighting explicitly and keeps math and video off', () => {
    expect(pkgJson['enriched-markdown']).toEqual({
      enableCodeHighlight: true,
      enableMath: false,
      enableVideo: false,
    });
  });

  it('pins the renderer to an exact version', () => {
    expect(pkgJson.dependencies['react-native-enriched-markdown']).toMatch(
      /^\d+\.\d+\.\d+$/,
    );
  });

  it.each(['katex', 'react-native-render-html', 'marked'])(
    'does not depend on %s',
    name => {
      expect(allDeps[name]).toBeUndefined();
      expect(
        importers(new RegExp(`from\\s+['"]${name}(/[^'"]*)?['"]`)),
      ).toEqual([]);
    },
  );
});
