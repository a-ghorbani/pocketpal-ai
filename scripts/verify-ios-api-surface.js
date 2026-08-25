#!/usr/bin/env node
/**
 * verify-ios-api-surface.js — checks a built iOS binary against
 * scripts/ios-api-surface-manifest.json.
 *
 * Usage:
 *   node scripts/verify-ios-api-surface.js --app <PocketPal.app | executable>
 *   node scripts/verify-ios-api-surface.js --ipa <path.ipa>
 *   [--manifest <path>]
 *
 * App Store Connect emits ITMS-90683 when a binary references an API that
 * needs a purpose string the Info.plist does not declare. The manifest names
 * the frameworks this app must not reference at all, so the warning is caught
 * on the pull request rather than on upload.
 *
 * Two things here are deliberate and would otherwise look arbitrary:
 *
 * - The symbol patterns are broad and the exceptions are named. An exact
 *   forbidden list cannot fail on a symbol nobody predicted; a broad pattern
 *   plus a reviewed `ignoredSymbols` list fails closed on it. A symbol that
 *   matches a pattern but belongs to some other framework is an over-match, and
 *   the repair is to correct the pattern, never to exempt the symbol.
 * - A zero-match reading is an instrument failure, not a pass, unless the same
 *   reading also found every sentinel. An empty grep proves nothing about a
 *   binary that may not have been read at all.
 *
 * Exit 0 when every declared requirement holds, non-zero otherwise — including
 * when the check could not read what it was asked to judge.
 *
 * Pattern mirrors scripts/verify-android-payload.js.
 */
const {execFileSync} = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_MANIFEST = path.join(__dirname, 'ios-api-surface-manifest.json');

function usage() {
  return [
    'Usage:',
    '  node scripts/verify-ios-api-surface.js --app <PocketPal.app | executable> [--manifest <path>]',
    '  node scripts/verify-ios-api-surface.js --ipa <path.ipa> [--manifest <path>]',
    '',
    'Exactly one of --app / --ipa is required.',
  ].join('\n');
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    switch (flag) {
      case '--app':
      case '--ipa':
      case '--manifest': {
        const value = argv[++i];
        if (!value || value.startsWith('--')) {
          throw new Error(`${flag} needs a path.\n\n${usage()}`);
        }
        if (args[flag.slice(2)]) {
          throw new Error(`${flag} was given twice.\n\n${usage()}`);
        }
        args[flag.slice(2)] = value;
        break;
      }
      default:
        throw new Error(`Unknown argument: ${flag}\n\n${usage()}`);
    }
  }
  if (!args.app && !args.ipa) {
    throw new Error(`Nothing to check.\n\n${usage()}`);
  }
  if (args.app && args.ipa) {
    throw new Error(
      `--app and --ipa name different subjects; pass one.\n\n${usage()}`,
    );
  }
  args.manifest = args.manifest || DEFAULT_MANIFEST;
  return args;
}

function refuse(manifestPath, why) {
  throw new Error(`${manifestPath} ${why}.`);
}

/**
 * Emptying a list is the cheapest edit that unblocks a build, and every list
 * below degrades the same silent way: the rule stops being checked and nothing
 * else covers it.
 *
 * `symbolPatterns` and `selectors` are floored as both, not either: they read
 * different surfaces. A Swift-only API use emits no Objective-C selector, and a
 * constant such as _kCLLocationAccuracyNearestTenMeters is symbol-visible only,
 * so clearing one list alone disarms half the surface.
 */
function assertForbiddenFloors(entry, manifestPath) {
  const named = entry.framework || '(unnamed framework)';
  const patterns = entry.symbolPatterns;
  const selectors = entry.selectors;

  if (typeof entry.framework !== 'string' || entry.framework.length === 0) {
    refuse(
      manifestPath,
      'declares a forbidden surface that names no framework',
    );
  }
  if (!Array.isArray(patterns) || patterns.length === 0) {
    refuse(manifestPath, `declares no symbol patterns for ${named}`);
  }
  if (!Array.isArray(selectors) || selectors.length === 0) {
    refuse(manifestPath, `declares no selectors for ${named}`);
  }
  // What makes the framework name load-bearing: dropping the pattern that
  // names the framework is then refused here rather than by prose.
  if (
    !patterns.some(
      pattern =>
        typeof pattern === 'string' &&
        pattern.toLowerCase() === entry.framework.toLowerCase(),
    )
  ) {
    refuse(
      manifestPath,
      `declares symbol patterns for ${named} that do not include "${entry.framework.toLowerCase()}", so the framework's own name would not be searched for`,
    );
  }
  const ignored = entry.ignoredSymbols || [];
  if (!Array.isArray(ignored)) {
    refuse(
      manifestPath,
      `has an ignoredSymbols for ${named} that is not a list`,
    );
  }
  for (const exemption of ignored) {
    if (
      !exemption ||
      typeof exemption.symbol !== 'string' ||
      !exemption.symbol
    ) {
      refuse(manifestPath, `exempts an unnamed symbol for ${named}`);
    }
    if (typeof exemption.reason !== 'string' || exemption.reason.length === 0) {
      refuse(
        manifestPath,
        `exempts ${exemption.symbol} for ${named} with no reason; every exemption is a reviewed judgement about the API surface`,
      );
    }
  }
  if (
    entry.reportOnlyDylibs !== undefined &&
    !Array.isArray(entry.reportOnlyDylibs)
  ) {
    refuse(
      manifestPath,
      `has a reportOnlyDylibs for ${named} that is not a list`,
    );
  }
}

function assertSentinelFloors(sentinels, manifestPath) {
  if (!Array.isArray(sentinels) || sentinels.length === 0) {
    refuse(
      manifestPath,
      'declares no sentinels, so a reading that found nothing at all would report a pass',
    );
  }
  for (const sentinel of sentinels) {
    const symbols = sentinel.undefinedSymbols || [];
    const selectors = sentinel.selectors || [];
    if (!Array.isArray(symbols) || !Array.isArray(selectors)) {
      refuse(manifestPath, 'declares a sentinel whose lists are not lists');
    }
    if (symbols.length === 0 && selectors.length === 0) {
      refuse(manifestPath, 'declares a sentinel that asserts nothing');
    }
    if (typeof sentinel.reason !== 'string' || sentinel.reason.length === 0) {
      refuse(
        manifestPath,
        'declares a sentinel with no reason; the reason is the shipped feature that guarantees it',
      );
    }
  }
  // Both readings need a control of their own: a sentinel set that only names
  // symbols leaves an empty selector section indistinguishable from a clean one.
  if (
    !sentinels.some(sentinel => (sentinel.undefinedSymbols || []).length > 0)
  ) {
    refuse(
      manifestPath,
      'declares no sentinel symbol, so the symbol reading has no control',
    );
  }
  if (!sentinels.some(sentinel => (sentinel.selectors || []).length > 0)) {
    refuse(
      manifestPath,
      'declares no sentinel selector, so the selector reading has no control',
    );
  }
}

function loadManifest(manifestPath) {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  } catch (err) {
    throw new Error(
      `Could not read the manifest ${manifestPath}: ${err.message}`,
    );
  }
  if (!Array.isArray(manifest.forbidden) || manifest.forbidden.length === 0) {
    refuse(
      manifestPath,
      'declares no forbidden surface, so it would pass any binary',
    );
  }
  for (const entry of manifest.forbidden) {
    assertForbiddenFloors(entry, manifestPath);
  }
  assertSentinelFloors(manifest.sentinels, manifestPath);
  return manifest;
}

function run(tool, toolArgs) {
  try {
    return execFileSync(tool, toolArgs, {
      encoding: 'utf-8',
      maxBuffer: 256 * 1024 * 1024,
    });
  } catch (err) {
    throw new Error(
      `could not run ${tool} ${toolArgs.join(' ')}: ${err.message.trim()}`,
    );
  }
}

function executableInsideBundle(bundle) {
  const candidate = path.join(bundle, path.basename(bundle, '.app'));
  if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) {
    throw new Error(
      `${bundle} contains no executable at ${path.basename(candidate)}; point --app at the executable itself`,
    );
  }
  return candidate;
}

function locateBinary(args) {
  if (args.ipa) {
    const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'ios-api-surface-'));
    run('unzip', ['-q', args.ipa, '-d', workdir]);
    const payload = path.join(workdir, 'Payload');
    const bundles = fs.existsSync(payload)
      ? fs.readdirSync(payload).filter(entry => entry.endsWith('.app'))
      : [];
    if (bundles.length !== 1) {
      throw new Error(
        `${args.ipa} contains ${bundles.length} app bundles under Payload/; expected exactly one`,
      );
    }
    return executableInsideBundle(path.join(payload, bundles[0]));
  }
  if (!fs.existsSync(args.app)) {
    throw new Error(`${args.app} does not exist`);
  }
  return fs.statSync(args.app).isDirectory()
    ? executableInsideBundle(args.app)
    : args.app;
}

function parseSelectorSection(output) {
  const selectors = [];
  for (const line of output.split('\n')) {
    const match = /^\s*[0-9a-f]+\s+(\S.*)$/i.exec(line);
    if (match) {
      selectors.push(match[1].trim());
    }
  }
  return selectors;
}

function parseLoadedDylibs(output) {
  const dylibs = [];
  for (const line of output.split('\n')) {
    const match = /^\s+(\S+)\s+\(compatibility version/.exec(line);
    if (match) {
      dylibs.push(match[1]);
    }
  }
  return dylibs;
}

/**
 * Every slice, because a read that stopped at slice 0 would miss the other and
 * would read as a pass. `-arch` is passed to every tool including `otool -L`,
 * which on a fat file otherwise concatenates both slices' load commands.
 */
function readSlices(binary) {
  const arches = run('lipo', ['-archs', binary])
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (arches.length === 0) {
    throw new Error(`lipo reported no architectures for ${binary}`);
  }
  return arches.map(arch => ({
    arch,
    undefinedSymbols: run('nm', ['-u', '-arch', arch, binary])
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean),
    selectors: parseSelectorSection(
      run('otool', [
        '-arch',
        arch,
        '-v',
        '-s',
        '__TEXT',
        '__objc_methname',
        binary,
      ]),
    ),
    dylibs: parseLoadedDylibs(run('otool', ['-arch', arch, '-L', binary])),
  }));
}

function checkSentinels({sentinels, symbols, selectors, report, fail, arch}) {
  for (const sentinel of sentinels) {
    for (const symbol of sentinel.undefinedSymbols || []) {
      const present = symbols.includes(symbol);
      report.push(`    ${present ? 'present' : 'MISSING'}  ${symbol}`);
      if (!present) {
        fail(
          [
            `the ${arch} slice does not reference ${symbol}, which the manifest declares a sentinel.`,
            `Reason on record: ${sentinel.reason}`,
            'The check reports failure rather than success — a binary that is missing what it must',
            'contain was not read correctly, and an absence found beside that is not evidence.',
          ].join('\n      '),
        );
      }
    }
    for (const selector of sentinel.selectors || []) {
      const present = selectors.includes(selector);
      report.push(`    ${present ? 'present' : 'MISSING'}  ${selector}`);
      if (!present) {
        fail(
          [
            `the ${arch} slice does not use the selector ${selector}, which the manifest declares a sentinel.`,
            `Reason on record: ${sentinel.reason}`,
            'The check reports failure rather than success — the selector section was read, but not',
            'the one this binary was expected to have.',
          ].join('\n      '),
        );
      }
    }
  }
}

function checkForbidden({
  entry,
  symbols,
  selectors,
  dylibs,
  report,
  fail,
  arch,
}) {
  const patterns = entry.symbolPatterns.map(pattern => pattern.toLowerCase());
  const exemptions = new Map(
    (entry.ignoredSymbols || []).map(item => [item.symbol, item.reason]),
  );
  const matched = symbols.filter(symbol =>
    patterns.some(pattern => symbol.toLowerCase().includes(pattern)),
  );

  report.push(
    `    ${entry.framework}: ${matched.length} symbols matching ${entry.symbolPatterns.map(p => `"${p}"`).join(', ')}`,
  );
  for (const symbol of matched) {
    const reason = exemptions.get(symbol);
    report.push(
      reason
        ? `      exempt     ${symbol} — ${reason}`
        : `      FORBIDDEN  ${symbol}`,
    );
  }
  const offending = matched.filter(symbol => !exemptions.has(symbol));
  if (offending.length > 0) {
    fail(
      [
        `the ${arch} slice references ${offending.join(', ')}.`,
        `${entry.framework} is a sensitive API, and this app declares no ${entry.purposeStringKey}`,
        'in ios/PocketPal/Info.plist, so App Store Connect rejects the upload with ITMS-90683.',
        'Remove the reference — a dependency flag or a patch under patches/ — rather than declaring',
        'a purpose string for an API the app does not use. If the symbol belongs to some other',
        'framework and the pattern selected it by accident, correct the pattern in',
        'scripts/ios-api-surface-manifest.json; do not exempt it.',
      ].join('\n      '),
    );
  }

  const usedSelectors = entry.selectors.filter(selector =>
    selectors.includes(selector),
  );
  report.push(
    `    ${entry.framework}: ${usedSelectors.length}/${entry.selectors.length} forbidden selectors present`,
  );
  for (const selector of usedSelectors) {
    report.push(`      FORBIDDEN  ${selector}`);
  }
  if (usedSelectors.length > 0) {
    fail(
      [
        `the ${arch} slice calls ${usedSelectors.join(', ')}.`,
        `These are ${entry.framework} API uses, and this app declares no ${entry.purposeStringKey},`,
        'so App Store Connect rejects the upload with ITMS-90683. Remove the call sites rather than',
        'declaring a purpose string for an API the app does not use.',
      ].join('\n      '),
    );
  }

  // Reported, never asserted: autolink hints are per-object and outlive
  // dead-stripping, so the framework stays in LC_LOAD_DYLIB after the last
  // symbol reference is gone. If ITMS-90683 survives a clean symbol reading,
  // linkage is the next hypothesis.
  const linked = (entry.reportOnlyDylibs || []).filter(name =>
    dylibs.some(dylib => dylib.includes(name)),
  );
  report.push(
    `    ${entry.framework}: linked dylibs (reported only): ${linked.join(', ') || 'none'}`,
  );
}

function evaluateReadings({manifest, slices}) {
  const report = [];
  const failures = [];
  const fail = message => failures.push(`FAIL: ${message}`);

  for (const slice of slices) {
    const symbols = slice.undefinedSymbols || [];
    const selectors = slice.selectors || [];
    report.push(`  slice ${slice.arch}`);
    report.push(
      `    ${symbols.length} undefined symbols, ${selectors.length} selectors, ${(slice.dylibs || []).length} loaded dylibs`,
    );

    if (symbols.length === 0) {
      fail(
        [
          `the ${slice.arch} slice reported no undefined symbols.`,
          'A stripped or unreadable binary produces the same empty result as a clean one, so this',
          'is an instrument failure, not a pass.',
        ].join('\n      '),
      );
    }
    if (selectors.length === 0) {
      fail(
        [
          `the ${slice.arch} slice has an empty __TEXT,__objc_methname section.`,
          'Every Objective-C binary has selectors; an empty section means the section was not read,',
          'so this is an instrument failure, not a pass.',
        ].join('\n      '),
      );
    }

    report.push('    sentinels');
    checkSentinels({
      sentinels: manifest.sentinels,
      symbols,
      selectors,
      report,
      fail,
      arch: slice.arch,
    });

    for (const entry of manifest.forbidden) {
      checkForbidden({
        entry,
        symbols,
        selectors,
        dylibs: slice.dylibs || [],
        report,
        fail,
        arch: slice.arch,
      });
    }
  }

  return {report, failures};
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = loadManifest(args.manifest);
  const binary = locateBinary(args);
  const slices = readSlices(binary);

  const {report, failures} = evaluateReadings({manifest, slices});
  const lines = [
    'iOS API surface check',
    `manifest: ${args.manifest}`,
    `binary:   ${binary}`,
    `slices:   ${slices.map(slice => slice.arch).join(', ')}`,
    '',
    ...report,
    '',
    failures.length === 0
      ? 'PASS: no forbidden API surface in any slice, and every sentinel was found.'
      : failures.join('\n\n'),
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
  return failures.length === 0 ? 0 : 1;
}

if (require.main === module) {
  try {
    process.exit(main());
  } catch (err) {
    console.error(`FAIL: ${err.message}`);
    process.exit(1);
  }
}

module.exports = {loadManifest, evaluateReadings};
