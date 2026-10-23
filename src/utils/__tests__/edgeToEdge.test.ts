import * as fs from 'fs';
import * as path from 'path';

const loadHelper = (
  os: 'ios' | 'android',
  constants: {isEdgeToEdge?: boolean},
) => {
  jest.resetModules();
  const {Platform, TurboModuleRegistry} = require('react-native');
  Platform.OS = os;
  const getConstants = jest.fn(() => constants);
  jest
    .spyOn(TurboModuleRegistry, 'get')
    .mockImplementation((name: unknown) =>
      name === 'DeviceInfo' ? {getConstants} : null,
    );
  const {measuresIncludeStatusBar} = require('../edgeToEdge');
  return {measuresIncludeStatusBar, getConstants};
};

describe('measuresIncludeStatusBar', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('is false on iOS without reading native constants', () => {
    const {measuresIncludeStatusBar, getConstants} = loadHelper('ios', {
      isEdgeToEdge: true,
    });

    expect(measuresIncludeStatusBar()).toBe(false);
    expect(getConstants).not.toHaveBeenCalled();
  });

  it('is false on Android when the edge-to-edge flag is off', () => {
    const {measuresIncludeStatusBar} = loadHelper('android', {
      isEdgeToEdge: false,
    });

    expect(measuresIncludeStatusBar()).toBe(false);
  });

  it('is false on Android when the edge-to-edge flag is absent', () => {
    const {measuresIncludeStatusBar} = loadHelper('android', {});

    expect(measuresIncludeStatusBar()).toBe(false);
  });

  it('is true on Android when the edge-to-edge flag is on', () => {
    const {measuresIncludeStatusBar} = loadHelper('android', {
      isEdgeToEdge: true,
    });

    expect(measuresIncludeStatusBar()).toBe(true);
  });

  it('reads the native constants once across calls', () => {
    const {measuresIncludeStatusBar, getConstants} = loadHelper('android', {
      isEdgeToEdge: true,
    });

    measuresIncludeStatusBar();
    measuresIncludeStatusBar();
    measuresIncludeStatusBar();

    expect(getConstants).toHaveBeenCalledTimes(1);
  });

  it("matches React Native's DeviceInfo module name and isEdgeToEdge constant", () => {
    const rn = path.join(
      __dirname,
      '..',
      '..',
      '..',
      'node_modules',
      'react-native',
    );
    const jsSpec = fs.readFileSync(
      path.join(rn, 'src/private/specs_DEPRECATED/modules/NativeDeviceInfo.js'),
      'utf8',
    );
    const androidModule = fs.readFileSync(
      path.join(
        rn,
        'ReactAndroid/src/main/java/com/facebook/react/modules/deviceinfo/DeviceInfoModule.kt',
      ),
      'utf8',
    );

    expect(jsSpec).toContain("getEnforcing<Spec>('DeviceInfo')");
    expect(jsSpec).toContain('isEdgeToEdge');
    expect(androidModule).toContain(
      '"isEdgeToEdge" to isEdgeToEdgeFeatureFlagOn',
    );
  });
});
