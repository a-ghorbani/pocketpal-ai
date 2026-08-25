const {execFileSync} = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  loadManifest,
  evaluateReadings,
} = require('../verify-ios-api-surface.js');

const SCRIPT_PATH = path.join(__dirname, '..', 'verify-ios-api-surface.js');
const MANIFEST_PATH = path.join(
  __dirname,
  '..',
  'ios-api-surface-manifest.json',
);
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
const coreLocation = manifest.forbidden[0];

const sentinelSymbols = manifest.sentinels.flatMap(
  sentinel => sentinel.undefinedSymbols || [],
);
const sentinelSelectors = manifest.sentinels.flatMap(
  sentinel => sentinel.selectors || [],
);

/**
 * A reading of a binary that has already been fixed, built from the committed
 * manifest so the fixture cannot drift away from what the gate is asked to
 * enforce. Every case below breaks exactly one thing in it: a rule only ever
 * seen passing is not known to be able to fail.
 *
 * It carries the exempted autolink hint on purpose — that symbol survives the
 * fix and must be suppressed rather than reported.
 */
function passingSlice(arch = 'arm64') {
  return {
    arch,
    undefinedSymbols: [
      ...sentinelSymbols,
      ...coreLocation.ignoredSymbols.map(exemption => exemption.symbol),
      '_OBJC_CLASS_$_NSString',
      '_objc_msgSend',
    ],
    selectors: [...sentinelSelectors, 'init', 'dealloc', 'authorizationStatus'],
    dylibs: [
      '/System/Library/Frameworks/CoreLocation.framework/CoreLocation',
      '/usr/lib/swift/libswiftCoreLocation.dylib',
      '/usr/lib/libobjc.A.dylib',
    ],
  };
}

const verdict = slices => evaluateReadings({manifest, slices});

function writeManifest(contents) {
  const file = path.join(tempDir(), 'manifest.json');
  fs.writeFileSync(file, JSON.stringify(contents));
  return file;
}

function withoutFirstForbidden(overrides) {
  return {
    ...manifest,
    forbidden: [{...coreLocation, ...overrides}],
  };
}

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ios-api-surface-test-'));
}

/**
 * Every case using this stops in argument parsing, the manifest, or path
 * resolution, all of which run before the first Mach-O tool, so they hold on
 * any platform.
 */
function runGate(args) {
  try {
    return {
      status: 0,
      output: execFileSync(process.execPath, [SCRIPT_PATH, ...args], {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    };
  } catch (err) {
    return {
      status: err.status,
      output: `${err.stdout || ''}${err.stderr || ''}`,
    };
  }
}

describe('evaluateReadings', () => {
  it('passes a clean reading', () => {
    const {failures, report} = verdict([passingSlice()]);
    expect(failures).toEqual([]);
    expect(report.join('\n')).toContain(
      `exempt     ${coreLocation.ignoredSymbols[0].symbol}`,
    );
  });

  /**
   * Every rule below is per slice, so a set with no slices satisfies all of
   * them vacuously. `main()` cannot reach this — `readSlices` throws when lipo
   * reports no architectures — but this is the exported surface.
   */
  it.each([
    ['an empty list', []],
    ['undefined', undefined],
  ])('fails on %s of slices rather than reporting a pass', (_label, slices) => {
    const {failures} = verdict(slices);
    expect(failures.join('\n')).toContain('no architecture slices were read');
    expect(failures.join('\n')).toContain('instrument failure');
  });

  it('fails when a forbidden symbol is referenced', () => {
    const slice = passingSlice();
    slice.undefinedSymbols.push('_OBJC_CLASS_$_CLLocationManager');
    const {failures} = verdict([slice]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('_OBJC_CLASS_$_CLLocationManager');
    expect(failures[0]).toContain('ITMS-90683');
  });

  it('fails on a matching symbol that no exemption names', () => {
    const slice = passingSlice();
    slice.undefinedSymbols.push('_kCLLocationAccuracyNearestTenMeters');
    const {failures} = verdict([slice]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('_kCLLocationAccuracyNearestTenMeters');
  });

  it('fails when a forbidden selector is used', () => {
    const slice = passingSlice();
    slice.selectors.push(coreLocation.selectors[0]);
    const {failures} = verdict([slice]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain(coreLocation.selectors[0]);
  });

  it('fails when a sentinel symbol is missing', () => {
    const slice = passingSlice();
    slice.undefinedSymbols = slice.undefinedSymbols.filter(
      symbol => symbol !== sentinelSymbols[0],
    );
    const {failures} = verdict([slice]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain(sentinelSymbols[0]);
  });

  it('fails when a sentinel selector is missing', () => {
    const slice = passingSlice();
    slice.selectors = slice.selectors.filter(
      selector => selector !== sentinelSelectors[0],
    );
    const {failures} = verdict([slice]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain(sentinelSelectors[0]);
  });

  it('fails on an empty symbol list rather than reporting a clean binary', () => {
    const slice = passingSlice();
    slice.undefinedSymbols = [];
    const {failures} = verdict([slice]);
    expect(failures.join('\n')).toContain('no undefined symbols');
    expect(failures.join('\n')).toContain('instrument failure');
  });

  it('fails on an empty selector section rather than reporting a clean binary', () => {
    const slice = passingSlice();
    slice.selectors = [];
    const {failures} = verdict([slice]);
    expect(failures.join('\n')).toContain('__objc_methname');
    expect(failures.join('\n')).toContain('instrument failure');
  });

  it('fails when only the second slice is dirty', () => {
    const dirty = passingSlice('x86_64');
    dirty.undefinedSymbols.push('_OBJC_CLASS_$_CLLocationManager');
    const {failures} = verdict([passingSlice('arm64'), dirty]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('x86_64');
  });

  it('names the slice that is dirty rather than the one that is clean', () => {
    const dirty = passingSlice('x86_64');
    dirty.undefinedSymbols.push('_OBJC_CLASS_$_CLLocationManager');
    const {failures} = verdict([passingSlice('arm64'), dirty]);
    expect(failures[0]).not.toContain('the arm64 slice');
  });

  it('reports each dirty slice separately', () => {
    const first = passingSlice('arm64');
    first.undefinedSymbols.push('_OBJC_CLASS_$_CLLocationManager');
    const second = passingSlice('x86_64');
    second.selectors.push('startUpdatingLocation');
    const {failures} = verdict([first, second]);
    expect(failures).toHaveLength(2);
    expect(failures[0]).toContain('the arm64 slice references');
    expect(failures[1]).toContain('the x86_64 slice calls');
  });

  /**
   * The whole reason the patterns are broad rather than an exact list of the
   * symbols measured today. `_OBJC_CLASS_$_CLLocationUpdate` appears in no
   * current build, so a forbidden list drawn from a measurement would pass it.
   */
  it('fails on a location symbol nobody predicted', () => {
    const slice = passingSlice();
    slice.undefinedSymbols.push('_OBJC_CLASS_$_CLLocationUpdate');
    const {failures} = verdict([slice]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('_OBJC_CLASS_$_CLLocationUpdate');
  });

  it('exempts only the exact symbol named, not names that extend it', () => {
    const slice = passingSlice();
    slice.undefinedSymbols.push(
      `${coreLocation.ignoredSymbols[0].symbol}Extra`,
    );
    const {failures} = verdict([slice]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain(
      `${coreLocation.ignoredSymbols[0].symbol}Extra`,
    );
  });

  /**
   * The declared limit of the mechanism, pinned so that widening the patterns
   * is a decision rather than a surprise: a location symbol that contains
   * neither pattern is not seen at all.
   */
  it('does not see a location symbol that matches no declared pattern', () => {
    const slice = passingSlice();
    slice.undefinedSymbols.push('_OBJC_CLASS_$_CLGeocoder');
    expect(verdict([slice]).failures).toEqual([]);
  });

  /**
   * The point past which the control is a reviewed manifest diff and not more
   * validation: an exemption carrying a false reason is well-formed, and the
   * gate honours it. Pinned so that a change making it fail is noticed as a
   * change of policy.
   */
  it('honours an exemption whose reason is false', () => {
    const weakened = {
      ...manifest,
      forbidden: [
        {
          ...coreLocation,
          ignoredSymbols: [
            ...coreLocation.ignoredSymbols,
            {
              symbol: '_OBJC_CLASS_$_CLLocationManager',
              reason: 'asserted, and wrong',
            },
          ],
        },
      ],
    };
    const slice = passingSlice();
    slice.undefinedSymbols.push('_OBJC_CLASS_$_CLLocationManager');
    expect(
      evaluateReadings({manifest: weakened, slices: [slice]}).failures,
    ).toEqual([]);
  });

  it('treats a selector as an exact name, not a prefix', () => {
    const slice = passingSlice();
    slice.selectors.push(`${coreLocation.selectors[0]}Suffix`);
    expect(verdict([slice]).failures).toEqual([]);
  });

  it('fails a slice whose readings are missing entirely', () => {
    const {failures} = verdict([{arch: 'arm64'}]);
    expect(failures.join('\n')).toContain('no undefined symbols');
    expect(failures.join('\n')).toContain('__objc_methname');
  });
});

describe('loadManifest floors', () => {
  it('accepts the committed manifest', () => {
    expect(loadManifest(MANIFEST_PATH).forbidden).toHaveLength(
      manifest.forbidden.length,
    );
  });

  it('refuses a manifest declaring no forbidden surface', () => {
    const file = writeManifest({...manifest, forbidden: []});
    expect(() => loadManifest(file)).toThrow(/no forbidden surface/);
  });

  it('refuses a forbidden surface with no symbol patterns', () => {
    const file = writeManifest(withoutFirstForbidden({symbolPatterns: []}));
    expect(() => loadManifest(file)).toThrow(/no symbol patterns/);
  });

  it('refuses a forbidden surface with no selectors', () => {
    const file = writeManifest(withoutFirstForbidden({selectors: []}));
    expect(() => loadManifest(file)).toThrow(/no selectors/);
  });

  it('refuses both lists cleared at once', () => {
    const file = writeManifest(
      withoutFirstForbidden({symbolPatterns: [], selectors: []}),
    );
    expect(() => loadManifest(file)).toThrow(/no symbol patterns/);
  });

  it("refuses symbol patterns that drop the framework's own name", () => {
    const file = writeManifest(
      withoutFirstForbidden({symbolPatterns: ['cllocation']}),
    );
    expect(() => loadManifest(file)).toThrow(/do not include "corelocation"/);
  });

  /**
   * `0` and `""` are falsy, so a default of `entry.ignoredSymbols || []` would
   * accept them and exempt nothing — the one way a floor can fail that leaves
   * the manifest looking checked.
   */
  it.each([
    ['zero', 0],
    ['an empty string', ''],
    ['null', null],
    ['an object', {}],
  ])('refuses an ignoredSymbols that is %s', (_label, value) => {
    const file = writeManifest(withoutFirstForbidden({ignoredSymbols: value}));
    expect(() => loadManifest(file)).toThrow(/is not a list/);
  });

  it('refuses an exemption with no reason', () => {
    const file = writeManifest(
      withoutFirstForbidden({
        ignoredSymbols: [{symbol: '_OBJC_CLASS_$_CLLocationManager'}],
      }),
    );
    expect(() => loadManifest(file)).toThrow(/with no reason/);
  });

  it('refuses a manifest declaring no sentinels', () => {
    const file = writeManifest({...manifest, sentinels: []});
    expect(() => loadManifest(file)).toThrow(/no sentinels/);
  });

  it('refuses a sentinel with no reason', () => {
    const file = writeManifest({
      ...manifest,
      sentinels: [{...manifest.sentinels[0], reason: ''}],
    });
    expect(() => loadManifest(file)).toThrow(/sentinel with no reason/);
  });

  it('refuses sentinels that leave the symbol reading without a control', () => {
    const file = writeManifest({
      ...manifest,
      sentinels: [{...manifest.sentinels[0], undefinedSymbols: []}],
    });
    expect(() => loadManifest(file)).toThrow(/no sentinel symbol/);
  });

  it('refuses sentinels that leave the selector reading without a control', () => {
    const file = writeManifest({
      ...manifest,
      sentinels: [{...manifest.sentinels[0], selectors: []}],
    });
    expect(() => loadManifest(file)).toThrow(/no sentinel selector/);
  });

  it('refuses a forbidden surface that names no framework', () => {
    const file = writeManifest(withoutFirstForbidden({framework: ''}));
    expect(() => loadManifest(file)).toThrow(/names no framework/);
  });

  it('refuses a forbidden surface whose framework key is absent', () => {
    const {framework, ...rest} = coreLocation;
    const file = writeManifest({...manifest, forbidden: [rest]});
    expect(() => loadManifest(file)).toThrow(/names no framework/);
  });

  it('refuses symbol patterns given as something other than a list', () => {
    const file = writeManifest(
      withoutFirstForbidden({symbolPatterns: 'corelocation'}),
    );
    expect(() => loadManifest(file)).toThrow(/no symbol patterns/);
  });

  it('refuses an exemption that names no symbol', () => {
    const file = writeManifest(
      withoutFirstForbidden({ignoredSymbols: [{reason: 'unexplained'}]}),
    );
    expect(() => loadManifest(file)).toThrow(/exempts an unnamed symbol/);
  });

  it('refuses an ignoredSymbols given as something other than a list', () => {
    const file = writeManifest(
      withoutFirstForbidden({
        ignoredSymbols: '_OBJC_CLASS_$_CLLocationManager',
      }),
    );
    expect(() => loadManifest(file)).toThrow(/ignoredSymbols .* not a list/);
  });

  it('refuses a reportOnlyDylibs given as something other than a list', () => {
    const file = writeManifest(
      withoutFirstForbidden({reportOnlyDylibs: 'CoreLocation.framework'}),
    );
    expect(() => loadManifest(file)).toThrow(/reportOnlyDylibs .* not a list/);
  });

  it('refuses a sentinel that asserts nothing', () => {
    const file = writeManifest({
      ...manifest,
      sentinels: [
        manifest.sentinels[0],
        {undefinedSymbols: [], selectors: [], reason: 'placeholder'},
      ],
    });
    expect(() => loadManifest(file)).toThrow(/asserts nothing/);
  });

  it('refuses a sentinel whose lists are not lists', () => {
    const file = writeManifest({
      ...manifest,
      sentinels: [
        {...manifest.sentinels[0], undefinedSymbols: '_OBJC_CLASS_$_NSString'},
      ],
    });
    expect(() => loadManifest(file)).toThrow(/lists are not lists/);
  });

  it('floors every forbidden surface, not only the first', () => {
    const file = writeManifest({
      ...manifest,
      forbidden: [coreLocation, {...coreLocation, selectors: []}],
    });
    expect(() => loadManifest(file)).toThrow(/no selectors/);
  });

  it('refuses a manifest it cannot read', () => {
    expect(() => loadManifest(path.join(tempDir(), 'absent.json'))).toThrow(
      /Could not read the manifest/,
    );
  });

  it('refuses a manifest that is not JSON', () => {
    const file = path.join(tempDir(), 'manifest.json');
    fs.writeFileSync(file, '{ not json');
    expect(() => loadManifest(file)).toThrow(/Could not read the manifest/);
  });
});

describe('the command line', () => {
  it('refuses to run with no subject', () => {
    const {status, output} = runGate([]);
    expect(status).toBe(1);
    expect(output).toContain('Nothing to check');
    expect(output).toContain('Usage:');
  });

  it('refuses two subjects at once', () => {
    const {status, output} = runGate(['--app', 'a', '--ipa', 'b']);
    expect(status).toBe(1);
    expect(output).toContain('name different subjects');
  });

  it('refuses a flag with no value', () => {
    const {status, output} = runGate(['--app']);
    expect(status).toBe(1);
    expect(output).toContain('--app needs a path');
  });

  it('refuses an unknown flag', () => {
    const {status, output} = runGate(['--binary', 'a']);
    expect(status).toBe(1);
    expect(output).toContain('Unknown argument: --binary');
  });

  it('refuses a subject that does not exist', () => {
    const missing = path.join(tempDir(), 'PocketPal.app');
    const {status, output} = runGate(['--app', missing]);
    expect(status).toBe(1);
    expect(output).toContain(`${missing} does not exist`);
    expect(output).not.toContain('PASS');
  });

  it('refuses a bundle holding no executable, and says where to point instead', () => {
    const bundle = path.join(tempDir(), 'PocketPal.app');
    fs.mkdirSync(bundle);
    fs.writeFileSync(path.join(bundle, 'Info.plist'), '');
    const {status, output} = runGate(['--app', bundle]);
    expect(status).toBe(1);
    expect(output).toContain('contains no executable at PocketPal');
    expect(output).toContain('point --app at the executable itself');
    expect(output).not.toContain('PASS');
  });

  it('refuses a bundle whose executable name is a directory', () => {
    const bundle = path.join(tempDir(), 'PocketPal.app');
    fs.mkdirSync(path.join(bundle, 'PocketPal'), {recursive: true});
    const {status, output} = runGate(['--app', bundle]);
    expect(status).toBe(1);
    expect(output).toContain('contains no executable');
  });

  it('refuses a weakened manifest before it opens the binary', () => {
    const file = writeManifest({...manifest, forbidden: []});
    const {status, output} = runGate([
      '--app',
      path.join(tempDir(), 'PocketPal.app'),
      '--manifest',
      file,
    ]);
    expect(status).toBe(1);
    expect(output).toContain('no forbidden surface');
    expect(output).not.toContain('does not exist');
  });
});
