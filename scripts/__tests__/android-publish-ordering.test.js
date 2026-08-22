const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

/**
 * Nothing may ship an Android artifact that the payload gate has not examined.
 * That property used to live in three YAML comments, where a step reordering,
 * an added `if:`, or a publishing step in a new workflow would break it in
 * silence. Here it is read off the committed workflow and Fastfile text.
 *
 * The rules below are applied to a parsed model, never to the files in place,
 * so every one of them is also exercised against a deliberately broken copy —
 * a rule asserted only over the committed files is true today and held by
 * nothing tomorrow.
 */
const ROOT = path.join(__dirname, '..', '..');
const WORKFLOW_DIR = path.join(ROOT, '.github', 'workflows');

// Named explicitly rather than globbed: a fourth Fastfile ships inside
// vendor/bundle wherever `bundle install` has run, so a glob count would be
// environment-dependent and unfit for a vacuity guard.
const FASTFILES = [
  ['root', path.join(ROOT, 'fastlane', 'Fastfile')],
  ['android', path.join(ROOT, 'android', 'fastlane', 'Fastfile')],
  ['ios', path.join(ROOT, 'ios', 'fastlane', 'Fastfile')],
];

const KNOWN_WORKFLOWS = [
  'ci.yml',
  'e2e-tests.yml',
  'l10n-upload.yml',
  'release.yml',
];

const SUSPICIOUS_RUN =
  /upload|publish|release|git push|gh |curl|wget|scp|rsync|aws s3/i;

// -- parsing ---------------------------------------------------------------

/**
 * Commentary is not command. Both Ruby and shell use `#`, and both files
 * discuss the very actions this file classifies — the upload lane's comment
 * quotes `gradle(task: "bundle")` to explain why it does not build.
 */
function codeOf(text) {
  return String(text)
    .split('\n')
    .map(line => line.replace(/(^|\s)#(?!\{).*$/, '$1'))
    .join('\n');
}

function parseLanes() {
  const lanes = [];
  for (const [origin, file] of FASTFILES) {
    const source = fs.readFileSync(file, 'utf-8');
    const starts = [...source.matchAll(/^\s*lane\s+:(\w+)\s+do/gm)];
    starts.forEach((match, i) => {
      const end = i + 1 < starts.length ? starts[i + 1].index : source.length;
      lanes.push({
        origin,
        name: match[1],
        body: codeOf(source.slice(match.index, end)),
      });
    });
  }
  return lanes;
}

function parseWorkflows() {
  return fs
    .readdirSync(WORKFLOW_DIR)
    .filter(name => /\.ya?ml$/.test(name))
    .sort()
    .map(file => {
      const doc = yaml.load(
        fs.readFileSync(path.join(WORKFLOW_DIR, file), 'utf-8'),
      );
      const jobs = Object.entries(doc.jobs || {}).map(([id, job]) => ({
        workflow: file,
        id,
        steps: (job.steps || []).map((step, index) => ({
          workflow: file,
          job: id,
          index,
          name: step.name || `(step ${index})`,
          run: codeOf(step.run || ''),
          uses: step.uses || '',
          with: step.with || {},
          raw: step,
        })),
      }));
      return {file, jobs};
    });
}

const model = () => ({workflows: parseWorkflows(), lanes: parseLanes()});
const allJobs = m => m.workflows.flatMap(workflow => workflow.jobs);
const allSteps = m => allJobs(m).flatMap(job => job.steps);
const where = step => `${step.workflow} ${step.job} → ${step.name}`;

// -- what a step says ------------------------------------------------------

function lanesInvokedBy(step, lanes) {
  return [...step.run.matchAll(/fastlane\s+(\w+)/g)]
    .map(match => lanes.find(lane => lane.name === match[1]))
    .filter(Boolean);
}

/**
 * Everything a step's text can be read to name, the bodies of the fastlane
 * lanes it invokes included. It does not follow shell scripts: a step that
 * rewrites an artifact without naming its path is outside what a text parse
 * can see, and is recorded as a known remainder rather than claimed.
 */
function stepText(step, lanes) {
  return [
    step.run,
    JSON.stringify(step.with),
    ...lanesInvokedBy(step, lanes).map(lane => lane.body),
  ].join('\n');
}

function artifactsIn(text) {
  return [
    ...new Set(
      [...String(text).matchAll(/([\w.-]+\.(?:apk|aab))/g)].map(m => m[1]),
    ),
  ];
}

function gitPushArguments(run) {
  return [...run.matchAll(/git\s+push\b([^\n]*)/g)]
    .map(match => match[1].trim())
    .filter(Boolean);
}

function buildsAndroid(body) {
  return (
    /\bgradle\s*\(/.test(body) && /task:\s*"(?:assemble|bundle)"/.test(body)
  );
}

function publishesAndroid(body) {
  return /upload_to_play_store|\bsupply\s*\(/.test(body);
}

function isBuildingJob(job, lanes) {
  return job.steps.some(
    step =>
      /gradlew\s+[^\n]*\b(?:assemble|bundle)/i.test(step.run) ||
      lanesInvokedBy(step, lanes).some(lane => buildsAndroid(lane.body)),
  );
}

function isGateStep(step) {
  return (
    step.run.includes('verify-android-payload.js') &&
    /--(?:apk|aab)\b/.test(step.run)
  );
}

function gateExamines(step) {
  return [...step.run.matchAll(/--(?:apk|aab)\s+(\S+)/g)].map(match =>
    path.basename(match[1]),
  );
}

/**
 * A publisher whose bytes this parse cannot name. A glob, a bare directory and
 * a `${{ }}` expression all reach an Android build output while matching no
 * literal `.apk`/`.aab`, so a rule keyed on filenames would see nothing to
 * compare and skip the step entirely. It is refused instead: the gate cannot
 * be shown to have read bytes the parse cannot identify.
 *
 * `anyExpression` holds for a `with:` path field, where the whole value is the
 * path and an expression therefore hides one. It is cleared for a shell
 * command, where a `${{ }}` is as likely to be a tag, a secret or a token —
 * `gh release create v1.0.0` publishes no binary at all — so only an
 * expression sitting against an `.apk`/`.aab` names an artifact there.
 */
const UNRESOLVED_PATH = '(a path this parse cannot resolve)';

function reachesUnresolvedAndroidOutput(value, {anyExpression = false} = {}) {
  const text = String(value ?? '');
  return (
    /build\/outputs/.test(text) ||
    (text.includes('*') && /\.(?:apk|aab)/.test(text)) ||
    /\$\{\{[^\n]*?\}\}[^\s"']*\.(?:apk|aab)/.test(text) ||
    (anyExpression && text.includes('${{'))
  );
}

/** Every way this repository can put built bytes in front of someone. */
function publisherOf(step, lanes) {
  const text = stepText(step, lanes);
  // Applied to every publisher that names a path, not only the `uses:` ones:
  // an unresolvable path leaves path identity with nothing to compare, and a
  // vacuous rule reads exactly like a satisfied one.
  const resolved = (source, options) => {
    const paths = artifactsIn(source);
    if (paths.length > 0) {
      return paths;
    }
    return reachesUnresolvedAndroidOutput(source, options)
      ? [UNRESOLVED_PATH]
      : [];
  };
  const pathsOrUnresolved = field => {
    const paths = artifactsIn(JSON.stringify(step.with));
    return paths.length > 0
      ? paths
      : resolved(String(step.with[field] ?? ''), {anyExpression: true});
  };
  if (/^actions\/upload-artifact@/.test(step.uses)) {
    const paths = pathsOrUnresolved('path');
    return paths.length > 0 ? {rule: 'workflow-artifact', paths} : null;
  }
  if (/^softprops\/action-gh-release@/.test(step.uses)) {
    return {rule: 'github-release', paths: pathsOrUnresolved('files')};
  }
  if (!step.run) {
    return null;
  }
  if (/upload_to_play_store/.test(text)) {
    return {rule: 'play-upload', paths: resolved(text)};
  }
  if (/\bgh\s+release\s+(?:create|upload)/.test(step.run)) {
    return {rule: 'gh-release-cli', paths: resolved(step.run)};
  }
  if (gitPushArguments(step.run).length > 0) {
    return {rule: 'tag-push', paths: []};
  }
  return null;
}

function obtainsAndroidOutput(step) {
  return (
    /^actions\/download-artifact@/.test(step.uses) ||
    /gh\s+run\s+download/.test(step.run) ||
    /\b(?:curl|wget)\b/.test(step.run) ||
    (/^actions\/cache@/.test(step.uses) &&
      /build\/outputs/.test(JSON.stringify(step.with)))
  );
}

// -- the exemption surfaces, each with a reason and a checked assertion -----

/**
 * Two transport patterns, not one, because `curl` and `wget` are transports in
 * both directions. A build step has no business running either; a composite
 * action that provisions an SDK legitimately fetches with `curl`, and is held
 * instead by naming no artifact.
 */
const SENDS_BYTES_OUT =
  /upload_to_|git push|gh\s+(?:release|api)|scp\s|rsync\s|aws s3/;
const MOVES_BYTES_AT_ALL = new RegExp(
  `${SENDS_BYTES_OUT.source}|\\bcurl\\b|\\bwget\\b`,
);

const namesNoAndroidArtifact = (step, _job, m) =>
  artifactsIn(stepText(step, m.lanes)).length === 0;

const carriesNoTransport = (step, _job, m) =>
  !MOVES_BYTES_AT_ALL.test(stepText(step, m.lanes));

/**
 * A property of the job, so it is never the whole assertion: on its own it
 * leaves a step free to grow a transport of its own while the gate below it
 * keeps the exemption green.
 */
const gatedLaterInTheSameJob = (step, job) =>
  job.steps.some(other => other.index > step.index && isGateStep(other));

const buildsThenIsGated = (step, job, m) =>
  gatedLaterInTheSameJob(step, job) &&
  namesNoAndroidArtifact(step, job, m) &&
  carriesNoTransport(step, job, m);

const runsNoAndroidGradle = (step, job, m) => !isBuildingJob(job, m.lanes);

/**
 * A step the suspicion net flags that publishes nothing. Each entry states why
 * and, beside it, the assertion that goes red when the reason stops holding —
 * an exemption asserted only in prose is the hole this whole file exists to
 * close.
 */
const NON_PUBLISHERS = [
  {
    workflow: 'release.yml',
    job: 'build_ios',
    step: 'Build and upload iOS app',
    reason: 'uploads to TestFlight; carries no Android payload',
    assert: (step, job, m) =>
      runsNoAndroidGradle(step, job, m) &&
      m.lanes
        .filter(lane => lane.origin === 'ios')
        .every(lane => !publishesAndroid(lane.body)),
  },
  {
    workflow: 'release.yml',
    job: 'build_android',
    step: 'Commit and push version changes',
    reason: 'pushes the version-bump commit; the tag is pushed after the gate',
    assert: step => gitPushArguments(step.run).every(args => args === ''),
  },
  {
    workflow: 'release.yml',
    job: 'build_android',
    step: 'Set up Android Keystore',
    reason: 'writes the signing keystore; matched only on the key file name',
    assert: (step, job, m) =>
      namesNoAndroidArtifact(step, job, m) && carriesNoTransport(step, job, m),
  },
  {
    workflow: 'release.yml',
    job: 'build_android',
    step: 'Build Android app',
    reason: 'builds the artifacts the gate then examines in the same job',
    assert: buildsThenIsGated,
  },
  {
    workflow: 'ci.yml',
    job: 'build-android',
    step: 'Create dummy release keystore for CI',
    reason: 'writes a throwaway signing key; matched only on the file name',
    assert: (step, job, m) =>
      namesNoAndroidArtifact(step, job, m) && carriesNoTransport(step, job, m),
  },
  {
    workflow: 'ci.yml',
    job: 'build-android',
    step: 'Build Android Release',
    reason: 'builds the artifact the gate then examines in the same job',
    assert: buildsThenIsGated,
  },
  {
    workflow: 'ci.yml',
    job: 'build-ios',
    step: 'Build iOS Release',
    reason: 'builds an iOS binary and transports nothing',
    assert: (step, job, m) =>
      namesNoAndroidArtifact(step, job, m) && carriesNoTransport(step, job, m),
  },
  {
    workflow: 'e2e-tests.yml',
    job: 'build-android',
    step: 'Create dummy release keystore for CI',
    reason: 'writes a throwaway signing key; matched only on the file name',
    assert: (step, job, m) =>
      namesNoAndroidArtifact(step, job, m) && carriesNoTransport(step, job, m),
  },
  {
    workflow: 'e2e-tests.yml',
    job: 'build-android',
    step: 'Build Android E2E APK',
    reason: 'builds the artifact the gate then examines in the same job',
    assert: buildsThenIsGated,
  },
  {
    workflow: 'ci.yml',
    job: 'build-android',
    step: 'Verify prod APK has no automation-bridge code (DCE sanity check)',
    reason: 'reads the built APK to assert what it does not contain',
    assert: carriesNoTransport,
  },
  {
    workflow: 'l10n-upload.yml',
    job: 'upload',
    step: 'Upload to Weblate',
    reason: 'uploads src/locales/en.json to the translation service',
    assert: (step, job, m) =>
      runsNoAndroidGradle(step, job, m) && namesNoAndroidArtifact(step, job, m),
  },
  // The gate steps name the artifact they open, so the net flags them. They
  // are exempt from it and governed by the gate rules instead, which are stricter than any
  // exemption: no if:, no suppression, no pipe, and the check last.
  ...['release.yml', 'ci.yml', 'e2e-tests.yml'].map(workflow => ({
    workflow,
    job: workflow === 'release.yml' ? 'build_android' : 'build-android',
    step: 'Verify the Android payload',
    reason: 'is the payload gate itself',
    assert: isGateStep,
  })),
];

const COMPOSITE_ACTIONS = {
  './.github/actions/setup-hexagon-sdk': path.join(
    ROOT,
    '.github/actions/setup-hexagon-sdk/action.yml',
  ),
  './.github/actions/setup-ccache': path.join(
    ROOT,
    '.github/actions/setup-ccache/action.yml',
  ),
};

/** Takes the source, not the path, so a mutated composite can be probed. */
const shipsNothing = source => {
  const commands = (yaml.load(source).runs.steps || [])
    .map(step => `${step.run || ''}\n${step.uses || ''}`)
    .join('\n');
  return !SENDS_BYTES_OUT.test(commands) && artifactsIn(commands).length === 0;
};

const compositeShipsNothing = step =>
  shipsNothing(fs.readFileSync(COMPOSITE_ACTIONS[step.uses], 'utf-8'));

const cacheReachesNoBuildOutput = step =>
  !/build\/outputs/.test(JSON.stringify(step.with));

/**
 * The actions a step may use without being classified. Floored exactly like
 * NON_PUBLISHERS: otherwise the cheapest way to publish through a new
 * third-party action is to add its name here.
 *
 * An entry declares **either** an `assert` that some input can falsify — the
 * probe below proves each one can — **or** a `carriedBy` naming the rule that
 * holds it instead. The two artifact-shipping actions get the second: for them
 * "is this a publisher?" is decided by the action name itself, so any
 * assertion phrased over the step restates its own lookup key and cannot fail.
 * Saying so is honest; writing a tautology and calling it a check is the shape
 * of the holes this file exists to close.
 */
const ALLOWED_ACTIONS = {
  'actions/checkout@v3': {
    reason: 'reads the repository',
    assert: namesNoAndroidArtifact,
  },
  'actions/checkout@v4': {
    reason: 'reads the repository',
    assert: namesNoAndroidArtifact,
  },
  'actions/setup-node@v3': {
    reason: 'installs a toolchain',
    assert: namesNoAndroidArtifact,
  },
  'actions/setup-node@v4': {
    reason: 'installs a toolchain',
    assert: namesNoAndroidArtifact,
  },
  'actions/setup-java@v3': {
    reason: 'installs a toolchain',
    assert: namesNoAndroidArtifact,
  },
  'actions/setup-java@v4': {
    reason: 'installs a toolchain',
    assert: namesNoAndroidArtifact,
  },
  'ruby/setup-ruby@v1': {
    reason: 'installs a toolchain',
    assert: namesNoAndroidArtifact,
  },
  'actions/cache@v3': {
    reason: 'restores a dependency cache',
    assert: cacheReachesNoBuildOutput,
  },
  'actions/cache@v4': {
    reason: 'restores a dependency cache',
    assert: cacheReachesNoBuildOutput,
  },
  'google-github-actions/auth@v2': {
    reason: 'mints a Google Cloud credential',
    assert: namesNoAndroidArtifact,
  },
  'actions/upload-artifact@v4': {
    reason:
      'uploads a workflow artifact; whether it ships build output is decided by its own path, and a path that cannot be resolved to a filename is refused rather than skipped',
    carriedBy: 'ordering and path identity',
  },
  'softprops/action-gh-release@v1': {
    reason: 'always a publisher, by the action name alone',
    carriedBy: 'ordering and path identity',
  },
  './.github/actions/setup-hexagon-sdk': {
    reason: 'fetches and verifies the Hexagon SDK',
    assert: compositeShipsNothing,
  },
  './.github/actions/setup-ccache': {
    reason: 'restores the compiler cache',
    assert: compositeShipsNothing,
  },
};

/** The only two entries that may stand on `carriedBy`; a third costs a review. */
const CARRIED_BY_THE_RULES = [
  'actions/upload-artifact@v4',
  'softprops/action-gh-release@v1',
];

const APK_PATH =
  'android/app/build/outputs/apk/prod/release/app-prod-release.apk';

/**
 * One step that every exemption assertion must reject: it names the APK, sends
 * it somewhere, pushes a tag, and sits in a building job with no gate after it.
 */
const PROBE_STEP = {
  workflow: 'probe.yml',
  job: 'probe',
  index: 1,
  name: 'Ship the APK',
  run: `git push origin "v1.0.0"\ncurl -T ${APK_PATH} https://example.com/`,
  uses: '',
  with: {path: APK_PATH},
  raw: {},
};

const PROBE_JOB = {
  workflow: 'probe.yml',
  id: 'probe',
  steps: [
    {
      workflow: 'probe.yml',
      job: 'probe',
      index: 0,
      name: 'Build it',
      run: './gradlew assembleProdRelease',
      uses: '',
      with: {},
      raw: {},
    },
    PROBE_STEP,
  ],
};

// -- the rules -------------------------------------------------------------

function exemptionFor(step) {
  return NON_PUBLISHERS.find(
    entry =>
      entry.workflow === step.workflow &&
      entry.job === step.job &&
      entry.step === step.name,
  );
}

/** Ordering: every publishing step sits above a gate step in its own job. */
function violationsOfOrdering(m) {
  const problems = [];
  for (const job of allJobs(m)) {
    if (!isBuildingJob(job, m.lanes)) {
      continue;
    }
    const gates = job.steps.filter(isGateStep);
    for (const step of job.steps) {
      if (!publisherOf(step, m.lanes)) {
        continue;
      }
      if (!gates.some(gate => gate.index < step.index)) {
        problems.push(
          `${where(step)} publishes at step ${step.index} with no gate step below it`,
        );
      }
    }
  }
  return problems;
}

/**
 * Path identity: the gate below a publishing step examined the bytes it publishes, and
 * nothing between the two named that artifact again. Ordering alone binds the
 * gate to nothing: gating the APK while publishing the bundle is ordered and
 * examines neither.
 */
function violationsOfPathIdentity(m) {
  const problems = [];
  for (const job of allJobs(m)) {
    const gates = job.steps.filter(isGateStep);
    for (const step of job.steps) {
      const publisher = publisherOf(step, m.lanes);
      if (!publisher) {
        continue;
      }
      for (const artifact of publisher.paths) {
        if (artifact === UNRESOLVED_PATH) {
          problems.push(
            `${where(step)} publishes a path this parse cannot resolve to a filename, so no gate step can be shown to have examined it`,
          );
          continue;
        }
        const gate = gates
          .filter(
            candidate =>
              candidate.index < step.index &&
              gateExamines(candidate).includes(artifact),
          )
          .pop();
        if (!gate) {
          problems.push(
            `${where(step)} publishes ${artifact}, which no gate step below it examined`,
          );
          continue;
        }
        const interposed = job.steps.find(
          other =>
            other.index > gate.index &&
            other.index < step.index &&
            stepText(other, m.lanes).includes(artifact),
        );
        if (interposed) {
          problems.push(
            `${where(interposed)} names ${artifact} after the gate examined it and before ${where(step)} publishes it`,
          );
        }
      }
    }
  }
  return problems;
}

/**
 * The gate can still fail the job. A skipped, suppressed or piped gate
 * keeps ordering and path identity green while asserting nothing: the default shell is
 * `bash -e {0}`, which sets no pipefail, so a trailing `| tee` exits with
 * tee's status.
 */
function violationsOfGateCanFail(m) {
  const problems = [];
  for (const step of allSteps(m)) {
    if (!isGateStep(step)) {
      continue;
    }
    const complain = why => problems.push(`${where(step)} ${why}`);
    if (step.raw.if !== undefined) {
      complain('carries an if:, so it can be skipped');
    }
    if (step.raw['continue-on-error'] !== undefined) {
      complain('carries continue-on-error');
    }
    if (step.raw.shell !== undefined) {
      complain('overrides shell:, which changes whether a pipe can hide it');
    }
    if (step.run.includes('||')) {
      complain('suppresses its exit status with ||');
    }
    if (step.run.replace(/\|\|/g, '').includes('|')) {
      complain('pipes its output, so it exits with the last command status');
    }
    if (/set\s+\+e/.test(step.run)) {
      complain('disables errexit with set +e');
    }
    if (step.run.includes('--manifest')) {
      complain('passes --manifest, which is a test flag');
    }
    const commands = step.run
      .replace(/\\\n\s*/g, ' ')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));
    if (!commands[commands.length - 1].includes('verify-android-payload.js')) {
      complain('does not invoke the payload check as its final command');
    }
  }
  return problems;
}

/** A publishing step outside a building job must obtain no build output. */
function violationsOfCrossJobPublish(m) {
  const problems = [];
  for (const job of allJobs(m)) {
    if (isBuildingJob(job, m.lanes)) {
      continue;
    }
    const publishers = job.steps.filter(step => publisherOf(step, m.lanes));
    const source = job.steps.find(obtainsAndroidOutput);
    if (publishers.length > 0 && source) {
      problems.push(
        `${where(publishers[0])} publishes in a job that builds nothing but obtains output at ${where(source)}`,
      );
    }
  }
  return problems;
}

/** No lane both builds and publishes; the split is invisible to the workflow graph. */
function violationsOfLaneSplit(m) {
  return m.lanes
    .filter(lane => buildsAndroid(lane.body) && publishesAndroid(lane.body))
    .map(lane => `${lane.origin} lane ${lane.name} both builds and publishes`);
}

/** Anything that looks like it could ship bytes is classified or exempt. */
function violationsOfSuspicionNet(m) {
  return allSteps(m)
    .filter(step => {
      if (publisherOf(step, m.lanes) || exemptionFor(step)) {
        return false;
      }
      return step.uses
        ? !ALLOWED_ACTIONS[step.uses]
        : SUSPICIOUS_RUN.test(step.run);
    })
    .map(step => `${where(step)} is neither classified nor exempt`);
}

// -- the committed files ---------------------------------------------------

const committed = model();

describe('the parse itself', () => {
  // Without these, a parse that matched nothing would make every rule below
  // pass vacuously and CI would stay green.
  it('parses every workflow into jobs with steps, exempting none', () => {
    const globbed = fs
      .readdirSync(WORKFLOW_DIR)
      .filter(name => /\.ya?ml$/.test(name))
      .sort();
    expect(committed.workflows.map(workflow => workflow.file)).toEqual(globbed);
    expect(globbed).toEqual(expect.arrayContaining(KNOWN_WORKFLOWS));
    for (const workflow of committed.workflows) {
      expect(workflow.jobs.length).toBeGreaterThan(0);
      for (const job of workflow.jobs) {
        expect(job.steps.length).toBeGreaterThan(0);
      }
    }
  });

  it('finds exactly the three Android building jobs, each gated', () => {
    const building = allJobs(committed)
      .filter(job => isBuildingJob(job, committed.lanes))
      .map(job => `${job.workflow}/${job.id}`);

    // A legitimate new Android build job costs a reviewed edit to this list,
    // which is the intended price: an ungated fourth one fails here first.
    expect(building.sort()).toEqual([
      'ci.yml/build-android',
      'e2e-tests.yml/build-android',
      'release.yml/build_android',
    ]);
    for (const job of allJobs(committed)) {
      if (isBuildingJob(job, committed.lanes)) {
        expect(job.steps.filter(isGateStep).length).toBeGreaterThan(0);
      }
    }
  });

  it('classifies the three release publishing steps by name', () => {
    const steps = Object.fromEntries(
      allSteps(committed)
        .filter(step => step.workflow === 'release.yml')
        .map(step => [step.name, publisherOf(step, committed.lanes)]),
    );

    expect(steps['Upload Android app to Alpha track'].rule).toBe('play-upload');
    expect(steps['Push the release tag'].rule).toBe('tag-push');
    expect(steps['Create GitHub Release'].rule).toBe('github-release');

    // Two of the three resolve to a path the identity rule can compare; a
    // tag names no artifact, so that rule is properly vacuous for it.
    expect(steps['Upload Android app to Alpha track'].paths).toEqual([
      'app-prod-release.aab',
    ]);
    expect(steps['Create GitHub Release'].paths).toEqual([
      'app-prod-release.apk',
    ]);
    expect(steps['Push the release tag'].paths).toEqual([]);
  });

  it('leaves no exemption unmatched, on either surface', () => {
    const suspicious = allSteps(committed).filter(step =>
      step.uses ? true : SUSPICIOUS_RUN.test(step.run),
    );
    expect(suspicious.length).toBeGreaterThan(0);

    for (const entry of NON_PUBLISHERS) {
      const matched = allSteps(committed).filter(
        step =>
          step.workflow === entry.workflow &&
          step.job === entry.job &&
          step.name === entry.step,
      );
      expect({entry: entry.step, matched: matched.length}).toEqual({
        entry: entry.step,
        matched: 1,
      });
      expect({
        entry: entry.step,
        holds: entry.assert(matched[0], jobOf(matched[0]), committed),
      }).toEqual({entry: entry.step, holds: true});
    }

    const used = new Set(
      allSteps(committed)
        .map(step => step.uses)
        .filter(Boolean),
    );
    expect([...used].sort()).toEqual(Object.keys(ALLOWED_ACTIONS).sort());
    for (const [action, entry] of Object.entries(ALLOWED_ACTIONS)) {
      const steps = allSteps(committed).filter(step => step.uses === action);
      expect({action, count: steps.length > 0}).toEqual({action, count: true});
      // Exactly one of the two floors, never neither and never both.
      expect({
        action,
        floored: Boolean(entry.assert) !== Boolean(entry.carriedBy),
      }).toEqual({
        action,
        floored: true,
      });
      for (const step of steps) {
        if (!entry.assert) {
          continue;
        }
        expect({
          action,
          holds: entry.assert(step, jobOf(step), committed),
        }).toEqual({action, holds: true});
      }
    }

    expect(
      Object.entries(ALLOWED_ACTIONS)
        .filter(([, entry]) => entry.carriedBy)
        .map(([action]) => action)
        .sort(),
    ).toEqual([...CARRIED_BY_THE_RULES].sort());
  });

  /**
   * An assertion that no input can falsify is not a check, and the easiest one
   * to write by accident restates its own lookup key. One adversarial step in
   * an ungated building job must falsify every assertion that reads a step;
   * one that survives it exempts by decoration. Add spellings here whenever an
   * exemption learns to read something new about a step.
   */
  it('rests no exemption on an assertion that cannot fail', () => {
    for (const entry of NON_PUBLISHERS) {
      expect({
        entry: `${entry.workflow} ${entry.step}`,
        survivesTheProbe: entry.assert(PROBE_STEP, PROBE_JOB, committed),
      }).toEqual({
        entry: `${entry.workflow} ${entry.step}`,
        survivesTheProbe: false,
      });
    }

    for (const [action, entry] of Object.entries(ALLOWED_ACTIONS)) {
      // The composites read their own action.yml rather than the step, so the
      // step-shaped probe says nothing about them; they are probed below.
      if (!entry.assert || COMPOSITE_ACTIONS[action]) {
        continue;
      }
      expect({
        action,
        survivesTheProbe: entry.assert(PROBE_STEP, PROBE_JOB, committed),
      }).toEqual({action, survivesTheProbe: false});
    }
  });

  it('refuses a composite action that grew a way to ship bytes', () => {
    const composite = command =>
      [
        'name: probe',
        'runs:',
        '  using: composite',
        '  steps:',
        `    - run: ${command}`,
        '      shell: bash',
      ].join('\n');

    expect(shipsNothing(composite('echo hello'))).toBe(true);
    expect(shipsNothing(composite('gh release upload v1 a.apk'))).toBe(false);
    expect(shipsNothing(composite('curl -T a.apk https://example.com/'))).toBe(
      false,
    );
    expect(shipsNothing(composite('scp a.aab example.com:/srv/'))).toBe(false);
  });

  it('reads the two Android fastlane lanes and what each one does', () => {
    const android = committed.lanes.filter(lane => lane.origin === 'android');
    expect(android.map(lane => lane.name)).toEqual([
      'build_android_release',
      'upload_android_alpha',
    ]);

    const [build, upload] = android;
    expect(buildsAndroid(build.body)).toBe(true);
    expect(publishesAndroid(build.body)).toBe(false);
    expect(publishesAndroid(upload.body)).toBe(true);
    expect(artifactsIn(upload.body)).toEqual(['app-prod-release.aab']);
  });
});

function jobOf(step) {
  return allJobs(committed).find(
    job => job.workflow === step.workflow && job.id === step.job,
  );
}

describe('no publish outruns the payload gate', () => {
  it.each([
    ['ordering', violationsOfOrdering],
    ['path identity', violationsOfPathIdentity],
    ['the gate can fail', violationsOfGateCanFail],
    ['cross-job publishing', violationsOfCrossJobPublish],
    ['the lane split', violationsOfLaneSplit],
    ['the suspicion net', violationsOfSuspicionNet],
  ])('%s holds over the committed workflows', (_label, rule) => {
    expect(rule(committed)).toEqual([]);
  });
});

/**
 * Each rule is applied to a deliberately broken in-memory copy. The committed
 * files are never touched: a rule that has only ever been seen passing is not
 * known to be capable of failing, which is how a fail-closed assertion becomes
 * decorative.
 */
describe('each rule is capable of failing', () => {
  const broken = () => model();

  const stepIn = (m, workflow, job, name) => {
    const found = allJobs(m)
      .find(
        candidate => candidate.workflow === workflow && candidate.id === job,
      )
      .steps.find(step => step.name === name);
    expect(found).toBeDefined();
    return found;
  };

  const jobIn = (m, workflow, job) =>
    allJobs(m).find(
      candidate => candidate.workflow === workflow && candidate.id === job,
    );

  const reindex = job =>
    job.steps.forEach((step, index) => (step.index = index));

  it('ordering fails when a publishing step is moved above the gate', () => {
    const m = broken();
    const job = jobIn(m, 'release.yml', 'build_android');
    const gate = job.steps.findIndex(isGateStep);
    const upload = job.steps.findIndex(
      step => step.name === 'Upload Android app to Alpha track',
    );
    job.steps.splice(gate, 0, job.steps.splice(upload, 1)[0]);
    reindex(job);

    expect(violationsOfOrdering(m)).toEqual([
      expect.stringContaining('Upload Android app to Alpha track'),
    ]);
  });

  it('path identity fails when a publisher ships bytes no gate step examined', () => {
    const m = broken();
    const job = jobIn(m, 'ci.yml', 'build-android');
    // The gate here passes --apk only, so a bundle built and uploaded beside
    // it is ordered after a gate that never opened it.
    job.steps.push({
      workflow: 'ci.yml',
      job: 'build-android',
      index: job.steps.length,
      name: 'Upload the bundle to Play',
      run: 'bundle exec fastlane upload_android_alpha',
      uses: '',
      with: {},
      raw: {},
    });

    expect(violationsOfOrdering(m)).toEqual([]);
    expect(violationsOfPathIdentity(m)).toEqual([
      expect.stringContaining('app-prod-release.aab'),
    ]);
  });

  it('path identity fails when a step rewrites the artifact after the gate read it', () => {
    const m = broken();
    const job = jobIn(m, 'release.yml', 'build_android');
    const gate = job.steps.findIndex(isGateStep);
    job.steps.splice(gate + 1, 0, {
      workflow: 'release.yml',
      job: 'build_android',
      index: 0,
      name: 'Re-sign the APK',
      run: 'apksigner sign android/app/build/outputs/apk/prod/release/app-prod-release.apk',
      uses: '',
      with: {},
      raw: {},
    });
    reindex(job);

    expect(violationsOfOrdering(m)).toEqual([]);
    expect(violationsOfPathIdentity(m)).toEqual([
      expect.stringContaining('Re-sign the APK'),
    ]);
  });

  it.each([
    ['a skipping if:', step => (step.raw.if = false)],
    ['continue-on-error', step => (step.raw['continue-on-error'] = true)],
    ['a || fallback', step => (step.run = `${step.run.trim()} || true`)],
    [
      'a pipe into tee',
      step => (step.run = `${step.run.trim()} 2>&1 | tee gate.log`),
    ],
    ['a trailing unrelated command', step => (step.run += '\necho done')],
    ['a test manifest', step => (step.run += ' --manifest /tmp/weak.json')],
  ])(
    'the gate-can-fail rule catches a gate neutered by %s',
    (_label, neuter) => {
      const m = broken();
      neuter(
        stepIn(m, 'ci.yml', 'build-android', 'Verify the Android payload'),
      );

      expect(violationsOfOrdering(m)).toEqual([]);
      expect(violationsOfGateCanFail(m).length).toBeGreaterThan(0);
    },
  );

  it('the cross-job rule fails when a job downloads the build output and publishes it', () => {
    const m = broken();
    const job = jobIn(m, 'ci.yml', 'build-and-test');
    job.steps.push(
      {
        workflow: 'ci.yml',
        job: 'build-and-test',
        index: job.steps.length,
        name: 'Download the APK',
        run: '',
        uses: 'actions/download-artifact@v4',
        with: {name: 'android-release-apk'},
        raw: {},
      },
      {
        workflow: 'ci.yml',
        job: 'build-and-test',
        index: job.steps.length + 1,
        name: 'Publish it',
        run: 'gh release upload v1.0.0 app-prod-release.apk',
        uses: '',
        with: {},
        raw: {},
      },
    );

    expect(violationsOfCrossJobPublish(m)).toEqual([
      expect.stringContaining('Publish it'),
    ]);
  });

  /**
   * The two allowlist entries carrying no assertion of their own claim the
   * ordering rules hold them. Checked here rather than asserted, and across
   * every spelling of a path — a rule keyed on literal filenames holds only
   * for the spelling it can read, and a glob, a bare directory or an
   * expression reaches the same bytes while matching none of them.
   */
  const SPELLINGS = [
    [
      'an explicit filename',
      'android/app/build/outputs/bundle/prodRelease/app-prod-release.aab',
      'app-prod-release.aab',
    ],
    [
      'a glob',
      'android/app/build/outputs/**/*.aab',
      'cannot resolve to a filename',
    ],
    [
      'a bare directory',
      'android/app/build/outputs/apk/prod/release/',
      'cannot resolve to a filename',
    ],
    ['an expression', '${{ env.APK_PATH }}', 'cannot resolve to a filename'],
  ];

  it.each(
    SPELLINGS.flatMap(([spelling, value, fragment]) => [
      [
        `actions/upload-artifact@v4 with ${spelling}`,
        {uses: 'actions/upload-artifact@v4', with: {name: 'out', path: value}},
        fragment,
      ],
      [
        `softprops/action-gh-release@v1 with ${spelling}`,
        {uses: 'softprops/action-gh-release@v1', with: {files: value}},
        fragment,
      ],
    ]),
  )('path identity catches %s', (_label, step, fragment) => {
    const m = broken();
    const job = jobIn(m, 'ci.yml', 'build-android');
    job.steps.push({
      ...step,
      workflow: 'ci.yml',
      job: 'build-android',
      index: job.steps.length,
      name: 'Ship the build output',
      run: '',
      raw: {},
    });

    expect(violationsOfOrdering(m)).toEqual([]);
    expect(violationsOfPathIdentity(m)).toEqual([
      expect.stringContaining(fragment),
    ]);
  });

  // The command-line publishers name their paths as arguments rather than in a
  // `with:` block, and the same spellings hide an artifact there. Ordering
  // alone held these: it fires on position, so it fired before this too — the
  // fix is that path identity stops being vacuous, which is what the second
  // assertion in each case is for.
  it.each([
    ['gh release create', 'gh release create v1.0.0 dist/*.apk'],
    [
      'a fastlane play upload',
      'bundle exec fastlane run upload_to_play_store aab:android/app/build/outputs/bundle/prodRelease/',
    ],
  ])('both rules catch %s naming no resolvable file', (_label, run) => {
    const m = broken();
    const job = jobIn(m, 'ci.yml', 'build-android');
    const gate = job.steps.findIndex(isGateStep);
    job.steps.splice(gate, 0, {
      workflow: 'ci.yml',
      job: 'build-android',
      index: 0,
      name: 'Publish the build output',
      run,
      uses: '',
      with: {},
      raw: {},
    });
    reindex(job);

    expect(violationsOfOrdering(m)).toEqual([
      expect.stringContaining('Publish the build output'),
    ]);
    expect(violationsOfPathIdentity(m)).toEqual([
      expect.stringContaining('cannot resolve to a filename'),
    ]);
  });

  // The sharpest form: an APK published before the gate has run at all, by a
  // step whose path names no file. Every rule read past it before it was
  // classified as a publisher with an unresolvable path.
  it('both rules catch a directory-path upload spliced above the gate', () => {
    const m = broken();
    const job = jobIn(m, 'ci.yml', 'build-android');
    const gate = job.steps.findIndex(isGateStep);
    job.steps.splice(gate, 0, {
      workflow: 'ci.yml',
      job: 'build-android',
      index: 0,
      name: 'Upload the APK directory',
      run: '',
      uses: 'actions/upload-artifact@v4',
      with: {
        name: 'android-release-apk',
        path: 'android/app/build/outputs/apk/prod/release/',
      },
      raw: {},
    });
    reindex(job);

    expect(violationsOfOrdering(m)).toEqual([
      expect.stringContaining('Upload the APK directory'),
    ]);
    expect(violationsOfPathIdentity(m)).toEqual([
      expect.stringContaining('cannot resolve to a filename'),
    ]);
  });

  it('the lane-split rule fails when the fastlane lanes are re-merged', () => {
    const m = broken();
    const build = m.lanes.find(lane => lane.name === 'build_android_release');
    build.body += '\n    upload_to_play_store(track: "alpha")\n';

    expect(violationsOfLaneSplit(m)).toEqual([
      expect.stringContaining('build_android_release'),
    ]);
  });

  it('the suspicion net fails on an unrecognised action, and on an unclassified transport', () => {
    const m = broken();
    const job = jobIn(m, 'ci.yml', 'build-and-test');
    job.steps.push(
      {
        workflow: 'ci.yml',
        job: 'build-and-test',
        index: job.steps.length,
        name: 'Ship it somewhere',
        run: '',
        uses: 'some-org/publish-anywhere@v1',
        with: {},
        raw: {},
      },
      {
        workflow: 'ci.yml',
        job: 'build-and-test',
        index: job.steps.length + 1,
        name: 'Copy it out',
        run: 'rsync -a build/ example.com:/srv/',
        uses: '',
        with: {},
        raw: {},
      },
    );

    expect(violationsOfSuspicionNet(m)).toEqual([
      expect.stringContaining('Ship it somewhere'),
      expect.stringContaining('Copy it out'),
    ]);
  });

  it('the building-job count fails first when a fourth Android build job appears', () => {
    const m = broken();
    const job = jobIn(m, 'ci.yml', 'build-and-test');
    job.steps.push({
      workflow: 'ci.yml',
      job: 'build-and-test',
      index: job.steps.length,
      name: 'Build Android Release',
      run: './gradlew assembleProdRelease',
      uses: '',
      with: {},
      raw: {},
    });

    const building = allJobs(m)
      .filter(candidate => isBuildingJob(candidate, m.lanes))
      .map(candidate => `${candidate.workflow}/${candidate.id}`);
    expect(building).toHaveLength(4);
  });
});
