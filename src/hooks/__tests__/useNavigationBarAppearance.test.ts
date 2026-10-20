import * as fs from 'fs';
import * as path from 'path';

import {renderHook} from '@testing-library/react-native';

import * as specModule from '../../specs/NativeNavigationBar';
import {uiStore} from '../../store';
import {useNavigationBarAppearance} from '../useNavigationBarAppearance';

const setNavigationBarDark = specModule.default!
  .setNavigationBarDark as jest.Mock;

describe('useNavigationBarAppearance', () => {
  beforeEach(() => {
    setNavigationBarDark.mockClear();
    uiStore.colorScheme = 'light';
  });

  it('requests light icons when the app is dark', () => {
    uiStore.colorScheme = 'dark';

    renderHook(() => useNavigationBarAppearance());

    expect(setNavigationBarDark).toHaveBeenCalledTimes(1);
    expect(setNavigationBarDark).toHaveBeenCalledWith(true);
  });

  it('requests dark icons when the scheme changes to light', () => {
    uiStore.colorScheme = 'dark';
    const {rerender} = renderHook(() => useNavigationBarAppearance());

    uiStore.colorScheme = 'light';
    rerender({});

    expect(setNavigationBarDark).toHaveBeenCalledTimes(2);
    expect(setNavigationBarDark).toHaveBeenLastCalledWith(false);
  });

  it('does not call again when the scheme is unchanged', () => {
    const {rerender} = renderHook(() => useNavigationBarAppearance());

    rerender({});

    expect(setNavigationBarDark).toHaveBeenCalledTimes(1);
  });

  it('exports no module on iOS', () => {
    jest.isolateModules(() => {
      const {Platform} = require('react-native');
      Platform.OS = 'ios';

      expect(
        jest.requireActual('../../specs/NativeNavigationBar').default,
      ).toBeNull();
    });
  });

  it('renders without calling native when the module is absent', () => {
    jest.replaceProperty(specModule, 'default', null);

    expect(() => renderHook(() => useNavigationBarAppearance())).not.toThrow();
    expect(setNavigationBarDark).not.toHaveBeenCalled();
  });
});

describe('navigation bar appearance writer', () => {
  const ROOT = path.join(__dirname, '..', '..', '..');

  const readCode = (file: string) =>
    fs
      .readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:\\/])\/\/.*$/gm, '$1');

  const sourceFiles = (dir: string, out: string[] = []): string[] => {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      if (entry.name === '__tests__' || entry.name === '__mocks__') {
        continue;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        sourceFiles(full, out);
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        out.push(full);
      }
    }
    return out;
  };

  const filesMatching = (re: RegExp) =>
    [...sourceFiles(path.join(ROOT, 'src')), path.join(ROOT, 'App.tsx')]
      .filter(file => re.test(readCode(file)))
      .map(file => path.relative(ROOT, file))
      .sort();

  it('only the hook calls the native module', () => {
    expect(filesMatching(/specs\/NativeNavigationBar['"]/)).toEqual([
      'src/hooks/useNavigationBarAppearance.ts',
    ]);
    expect(filesMatching(/setNavigationBarDark/)).toEqual([
      'src/hooks/useNavigationBarAppearance.ts',
      'src/specs/NativeNavigationBar.ts',
    ]);
  });

  it('only App calls the hook, imported outside the hooks barrel', () => {
    expect(filesMatching(/useNavigationBarAppearance\(\)/)).toEqual([
      'App.tsx',
    ]);
    expect(
      fs.readFileSync(path.join(ROOT, 'src/hooks/index.ts'), 'utf8'),
    ).not.toContain('useNavigationBarAppearance');
  });

  it('the native module writes only the activity nav-bar appearance', () => {
    const kotlin = readCode(
      path.join(
        ROOT,
        'android/app/src/main/java/com/pocketpalai/NavigationBarModule.kt',
      ),
    );

    expect(kotlin.match(/\.isAppearanceLight\w+\s*=/g)).toEqual([
      '.isAppearanceLightNavigationBars =',
    ]);
    expect(kotlin).toContain('currentActivity?.window');
    expect(kotlin).not.toMatch(
      /navigationBarColor|statusBarColor|ContrastEnforced|setDecorFitsSystemWindows|systemUiVisibility/,
    );
  });
});
