const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  loadManifest,
  evaluateReadings,
} = require('../verify-ios-api-surface.js');

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ios-api-surface-test-'));
  const file = path.join(dir, 'manifest.json');
  fs.writeFileSync(file, JSON.stringify(contents));
  return file;
}

function withoutFirstForbidden(overrides) {
  return {
    ...manifest,
    forbidden: [{...coreLocation, ...overrides}],
  };
}

describe('evaluateReadings', () => {
  it('passes a clean reading', () => {
    const {failures, report} = verdict([passingSlice()]);
    expect(failures).toEqual([]);
    expect(report.join('\n')).toContain(
      `exempt     ${coreLocation.ignoredSymbols[0].symbol}`,
    );
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
});
