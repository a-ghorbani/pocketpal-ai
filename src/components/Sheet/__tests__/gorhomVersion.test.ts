import * as fs from 'fs';
import * as path from 'path';

const DIFFED_VERSION = '5.2.14';
const PACKAGE = '@gorhom/bottom-sheet';
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');

const RECHECK = `${PACKAGE} differs from ${DIFFED_VERSION}, the version the sheet code was checked against. Before changing DIFFED_VERSION, re-check in the new version:
- keyboardAnimationConfig (Sheet/actionsPadding.ts) against src/utilities/getKeyboardAnimationConfigs.ts and src/utilities/animate.ts
- SheetAwareNativeInput's registration against src/components/bottomSheetTextInput/BottomSheetTextInput.tsx
- the context fields Sheet/gorhomInternal.ts reads: animatedKeyboardState, animatedPosition, animatedDetentsState, textInputNodesRef
- animateToPosition records a clamped lift as a detent index, which the keyboard-hide restore relies on
- the size reads: screen height in useAnimatedKeyboard, window height in BottomSheetHostingContainer, layoutState.window in useAnimatedLayout`;

const readJson = (...segments: string[]) =>
  JSON.parse(fs.readFileSync(path.join(ROOT, ...segments), 'utf8'));

const expectDiffedVersion = (source: string, version: string) => {
  if (version !== DIFFED_VERSION) {
    throw new Error(`${source}: ${version}\n${RECHECK}`);
  }
};

describe(`${PACKAGE} version`, () => {
  it('installs the diffed version', () => {
    const installed = readJson('node_modules', PACKAGE, 'package.json');
    expectDiffedVersion('installed', installed.version);
  });

  it('declares exactly the diffed version', () => {
    const app = readJson('package.json');
    expectDiffedVersion('declared in package.json', app.dependencies[PACKAGE]);
  });
});
