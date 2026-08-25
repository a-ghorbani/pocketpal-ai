const {execFileSync} = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SCRIPT_PATH = path.join(__dirname, '..', 'verify-ios-api-surface.js');

/**
 * `lipo`, `nm` and `otool` are macOS-only, so the reading half of the gate can
 * only be exercised where the gate itself runs. verify-ios-api-surface.test.js
 * covers the verdict on in-memory readings and holds on any platform; this file
 * covers everything between a path on disk and those readings, which the jest
 * job's Linux runner cannot reach.
 */
function toolchainIsAvailable() {
  if (process.platform !== 'darwin') {
    return false;
  }
  try {
    for (const tool of ['clang', 'lipo', 'nm', 'otool', 'zip', 'unzip']) {
      execFileSync('/usr/bin/which', [tool], {stdio: 'ignore'});
    }
    return true;
  } catch (err) {
    return false;
  }
}

const describeOnMac = toolchainIsAvailable() ? describe : describe.skip;

const CLEAN_SOURCE = `
#import <Foundation/Foundation.h>
#import <AVFoundation/AVFoundation.h>
int main(void) {
  AVCaptureSession *session = [[AVCaptureSession alloc] init];
  [AVCaptureDevice requestAccessForMediaType:AVMediaTypeVideo
                            completionHandler:^(BOOL granted) { (void)granted; }];
  NSLog(@"%@", session);
  return 0;
}
`;

const LOCATING_SOURCE = `
#import <Foundation/Foundation.h>
#import <AVFoundation/AVFoundation.h>
#import <CoreLocation/CoreLocation.h>
int main(void) {
  AVCaptureSession *session = [[AVCaptureSession alloc] init];
  [AVCaptureDevice requestAccessForMediaType:AVMediaTypeVideo
                            completionHandler:^(BOOL granted) { (void)granted; }];
  CLLocationManager *manager = [[CLLocationManager alloc] init];
  [manager requestWhenInUseAuthorization];
  manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters;
  NSLog(@"%@ %@", session, manager);
  return 0;
}
`;

let workdir;
const binary = {};

function compile(source, arch, frameworks, output) {
  const sourceFile = path.join(workdir, `${path.basename(output)}.m`);
  fs.writeFileSync(sourceFile, source);
  execFileSync(
    'clang',
    [
      '-arch',
      arch,
      '-fobjc-arc',
      ...frameworks.flatMap(name => ['-framework', name]),
      '-o',
      output,
      sourceFile,
    ],
    {stdio: 'ignore'},
  );
}

function fatten(slices, output) {
  execFileSync('lipo', ['-create', ...slices, '-output', output]);
  return output;
}

function appBundle(name, executable) {
  const bundle = path.join(workdir, `${name}.app`);
  fs.mkdirSync(bundle, {recursive: true});
  fs.copyFileSync(executable, path.join(bundle, name));
  return bundle;
}

function archive(name, bundleNames, executable) {
  const stage = fs.mkdtempSync(path.join(workdir, 'stage-'));
  for (const bundleName of bundleNames) {
    const bundle = path.join(stage, 'Payload', `${bundleName}.app`);
    fs.mkdirSync(bundle, {recursive: true});
    fs.copyFileSync(executable, path.join(bundle, bundleName));
  }
  if (bundleNames.length === 0) {
    fs.mkdirSync(path.join(stage, 'Payload'), {recursive: true});
    fs.writeFileSync(path.join(stage, 'Payload', 'placeholder'), '');
  }
  const ipa = path.join(workdir, `${name}.ipa`);
  execFileSync('zip', ['-qr', ipa, 'Payload'], {cwd: stage});
  return ipa;
}

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

describeOnMac('the gate reading a real Mach-O', () => {
  beforeAll(() => {
    workdir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'ios-api-surface-fixture-'),
    );
    const av = ['Foundation', 'AVFoundation'];
    const avAndLocation = [...av, 'CoreLocation'];
    for (const arch of ['arm64', 'x86_64']) {
      binary[`clean-${arch}`] = path.join(workdir, `clean-${arch}`);
      binary[`locating-${arch}`] = path.join(workdir, `locating-${arch}`);
      compile(CLEAN_SOURCE, arch, av, binary[`clean-${arch}`]);
      compile(LOCATING_SOURCE, arch, avAndLocation, binary[`locating-${arch}`]);
    }
    binary.clean = fatten(
      [binary['clean-arm64'], binary['clean-x86_64']],
      path.join(workdir, 'clean.fat'),
    );
    binary.locating = fatten(
      [binary['locating-arm64'], binary['locating-x86_64']],
      path.join(workdir, 'locating.fat'),
    );
    binary.dirtyFirstSlice = fatten(
      [binary['clean-arm64'], binary['locating-x86_64']],
      path.join(workdir, 'dirty-first-slice.fat'),
    );
    binary.dirtyLastSlice = fatten(
      [binary['locating-arm64'], binary['clean-x86_64']],
      path.join(workdir, 'dirty-last-slice.fat'),
    );
  }, 180000);

  it('passes a binary that references no location API', () => {
    const {status, output} = runGate(['--app', binary.clean]);
    expect(output).toContain('PASS');
    expect(status).toBe(0);
  });

  it('reads both slices of a fat binary', () => {
    const {output} = runGate(['--app', binary.clean]);
    expect(output).toContain('slices:   x86_64, arm64');
    expect(output).toContain('slice x86_64');
    expect(output).toContain('slice arm64');
  });

  it('finds the sentinels the manifest declares in a real symbol table', () => {
    const {output} = runGate(['--app', binary.clean]);
    expect(output).toContain('present  _OBJC_CLASS_$_AVCaptureDevice');
    expect(output).toContain('present  _OBJC_CLASS_$_AVCaptureSession');
    expect(output).toContain(
      'present  requestAccessForMediaType:completionHandler:',
    );
  });

  it('reads a non-empty selector section and dylib list from every slice', () => {
    const {output} = runGate(['--app', binary.clean]);
    const readings = output.match(
      /(\d+) undefined symbols, (\d+) selectors, (\d+) loaded dylibs/g,
    );
    expect(readings).toHaveLength(2);
    for (const reading of readings) {
      const [symbols, selectors, dylibs] = reading.match(/\d+/g).map(Number);
      expect(symbols).toBeGreaterThan(0);
      expect(selectors).toBeGreaterThan(0);
      expect(dylibs).toBeGreaterThan(0);
    }
  });

  /**
   * `otool -L` on a fat file with no `-arch` concatenates both slices' load
   * commands, which would give every slice the same list and hide which one
   * links what.
   */
  it('reads each slice of a fat binary separately', () => {
    const {output} = runGate(['--app', binary.dirtyLastSlice]);
    const dylibCounts = [...output.matchAll(/(\d+) loaded dylibs/g)].map(
      match => Number(match[1]),
    );
    expect(dylibCounts).toHaveLength(2);
    expect(new Set(dylibCounts).size).toBe(2);
  });

  it('fails a binary that references the location API', () => {
    const {status, output} = runGate(['--app', binary.locating]);
    expect(status).toBe(1);
    expect(output).toContain('_OBJC_CLASS_$_CLLocationManager');
    expect(output).toContain('_kCLLocationAccuracyNearestTenMeters');
    expect(output).toContain('requestWhenInUseAuthorization');
    expect(output).toContain('ITMS-90683');
  });

  it('fails when the first slice a fat binary reports is dirty', () => {
    const {status, output} = runGate(['--app', binary.dirtyFirstSlice]);
    expect(status).toBe(1);
    expect(output).toContain(
      'FAIL: the x86_64 slice references _OBJC_CLASS_$_CLLocationManager',
    );
    expect(output).not.toContain('FAIL: the arm64 slice references');
  });

  /**
   * A reading that stopped after the first slice would call this binary clean,
   * and the case above would not notice.
   */
  it('fails when the last slice a fat binary reports is dirty', () => {
    const {status, output} = runGate(['--app', binary.dirtyLastSlice]);
    expect(status).toBe(1);
    expect(output).toContain(
      'FAIL: the arm64 slice references _OBJC_CLASS_$_CLLocationManager',
    );
    expect(output).not.toContain('FAIL: the x86_64 slice references');
  });

  it('resolves the executable inside a .app bundle', () => {
    const bundle = appBundle('PocketPal', binary.clean);
    const {status, output} = runGate(['--app', bundle]);
    expect(status).toBe(0);
    expect(output).toContain(path.join(bundle, 'PocketPal'));
  });

  it('fails rather than reporting a pass when the subject is not a Mach-O', () => {
    const notABinary = path.join(workdir, 'not-a-binary');
    fs.writeFileSync(notABinary, 'plain text');
    const {status, output} = runGate(['--app', notABinary]);
    expect(status).toBe(1);
    expect(output).toContain('could not run lipo');
    expect(output).not.toContain('PASS');
  });
});

describeOnMac('the gate reading an archive', () => {
  beforeAll(() => {
    if (!workdir) {
      throw new Error('fixtures were not built');
    }
  });

  it('passes an archive whose app references no location API', () => {
    const ipa = archive('clean', ['PocketPal'], binary.clean);
    const {status, output} = runGate(['--ipa', ipa]);
    expect(status).toBe(0);
    expect(output).toContain('PASS');
    expect(output).toContain('Payload/PocketPal.app/PocketPal');
  });

  it('fails an archive whose app references the location API', () => {
    const ipa = archive('locating', ['PocketPal'], binary.locating);
    const {status, output} = runGate(['--ipa', ipa]);
    expect(status).toBe(1);
    expect(output).toContain('_OBJC_CLASS_$_CLLocationManager');
  });

  it('refuses an archive carrying more than one app bundle', () => {
    const ipa = archive('two', ['PocketPal', 'Extra'], binary.clean);
    const {status, output} = runGate(['--ipa', ipa]);
    expect(status).toBe(1);
    expect(output).toContain('contains 2 app bundles');
  });

  it('refuses an archive carrying no app bundle', () => {
    const ipa = archive('none', [], binary.clean);
    const {status, output} = runGate(['--ipa', ipa]);
    expect(status).toBe(1);
    expect(output).toContain('contains 0 app bundles');
  });

  /**
   * Distinct from the case above, which has a Payload/ that is empty. Both fail
   * closed, but reporting "0 app bundles under Payload/" for an archive that
   * has no Payload/ at all sends the reader looking in the wrong place.
   */
  it('says so when an archive has no Payload directory', () => {
    const stage = fs.mkdtempSync(path.join(workdir, 'no-payload-'));
    fs.mkdirSync(path.join(stage, 'Something'), {recursive: true});
    fs.writeFileSync(path.join(stage, 'Something', 'file'), '');
    const ipa = path.join(workdir, 'no-payload.ipa');
    execFileSync('zip', ['-qr', ipa, 'Something'], {cwd: stage});

    const {status, output} = runGate(['--ipa', ipa]);
    expect(status).toBe(1);
    expect(output).toContain('has no Payload/ directory');
    expect(output).not.toContain('app bundles under Payload/');
  });

  it('fails rather than reporting a pass when the archive cannot be opened', () => {
    const notAnArchive = path.join(workdir, 'not-an-archive.ipa');
    fs.writeFileSync(notAnArchive, 'plain text');
    const {status, output} = runGate(['--ipa', notAnArchive]);
    expect(status).toBe(1);
    expect(output).toContain('could not run unzip');
    expect(output).not.toContain('PASS');
  });
});
