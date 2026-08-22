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
 *
 * Quote-aware, because every consumer of this text is an unanchored presence
 * test: dropping a line's tail can only *lose* matches, which moves a step
 * toward "unclassified" and "exempt". `gh release upload … --notes "Fixes #862"`
 * is an ordinary line, and a naive strip turns it into a step that publishes
 * nothing and transports nothing. Failing that direction is the one direction
 * this file cannot afford.
 *
 * An unbalanced quote leaves the rest of the line unstripped, which keeps text
 * rather than losing it — wrong in the safe direction.
 */
function codeOf(text) {
  return String(text).split('\n').map(stripComment).join('\n');
}

function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const character = line[i];
    if (quote) {
      if (character === '\\') {
        i++;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    const startsComment =
      character === '#' &&
      line[i + 1] !== '{' &&
      (i === 0 || /\s/.test(line[i - 1]));
    if (startsComment) {
      return line.slice(0, i);
    }
  }
  return line;
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

/**
 * Every lane a step's command names. Matched against the known lane names
 * rather than by position, because `fastlane <lane>`, `fastlane android <lane>`
 * and `fastlane run <action>` are all valid here — `android/fastlane/Fastfile`
 * declares `default_platform :android`, so the platform-prefixed form works and
 * a position-based parse silently resolves it to the platform instead.
 *
 * `release.yml/build_android` runs no `gradlew` at all, so that job's entire
 * building-ness rests on this resolution.
 */
function lanesInvokedBy(step, lanes) {
  const named = new Set(
    [...step.run.matchAll(/fastlane\s+([\w\s]+)/g)].flatMap(match =>
      match[1].split(/\s+/),
    ),
  );
  return lanes.filter(lane => named.has(lane.name));
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
 * A publisher whose bytes this parse cannot name. It is refused rather than
 * skipped: the gate cannot be shown to have read bytes the parse cannot
 * identify, and a rule with nothing to compare reads exactly like a satisfied
 * one.
 */
const UNRESOLVED_PATH = '(a path this parse cannot resolve)';

/**
 * A `with:` path field, split into what it actually names. The whole value is
 * a path here — one per line, or one per list entry — so anything that is not
 * a concrete filename hides one, whatever directory it lives in. Keying on
 * `build/outputs` instead would leave `dist/`, `artifacts/` and
 * `android/app/release/` naming nothing and classifying as no publisher at all.
 */
function pathFieldNames(value) {
  const tokens = (
    Array.isArray(value) ? value : String(value ?? '').split('\n')
  )
    .map(token => String(token).trim())
    .filter(Boolean);

  const names = [];
  for (const token of tokens) {
    const base = token.split('/').pop();
    const concrete =
      !token.includes('${{') &&
      !/[*?]/.test(token) &&
      !token.endsWith('/') &&
      /\.[A-Za-z0-9]+$/.test(base);
    if (!concrete) {
      names.push(UNRESOLVED_PATH);
    } else if (/\.(?:apk|aab)$/.test(base)) {
      names.push(base);
    }
  }
  return [...new Set(names)];
}

/**
 * The same judgement over a shell command, but token by token rather than over
 * the whole text — most of a command's words are not paths, and `gh release
 * create v1.0.0` publishes no binary at all. Only a token that reaches an
 * Android build output or carries an `.apk`/`.aab` is considered, and each is
 * then resolvable or not on its own: asking the question of the whole string
 * would mark the Play upload unresolvable because the lane that names its
 * bundle exactly also happens to sit under `build/outputs`.
 */
function commandNames(text) {
  const names = new Set();
  for (const token of String(text ?? '').split(/[\s'"(),]+/)) {
    if (!token || !/build\/outputs|\.(?:apk|aab)/.test(token)) {
      continue;
    }
    const base = token.split('/').pop();
    const concrete =
      !token.includes('${{') &&
      !/[*?]/.test(token) &&
      !token.endsWith('/') &&
      /\.(?:apk|aab)$/.test(base);
    names.add(concrete ? base : UNRESOLVED_PATH);
  }
  return [...names];
}

/**
 * Every way this repository can put built bytes in front of someone.
 *
 * Additive, not first-match. A step can be more than one of these at once —
 * `gh release upload <dir>` appended to the Play-upload step is both — and a
 * single path list can mix a filename the gate examined with a glob reaching a
 * second artifact it never saw. Returning on the first match lets the second
 * one through under cover of the first.
 */
function publisherOf(step, lanes) {
  const text = stepText(step, lanes);
  const rules = [];
  const paths = [];
  const add = (rule, named) => {
    rules.push(rule);
    paths.push(...named);
  };

  if (/^actions\/upload-artifact@/.test(step.uses)) {
    const named = pathFieldNames(step.with.path);
    if (named.length > 0) {
      add('workflow-artifact', named);
    }
  }
  if (/^softprops\/action-gh-release@/.test(step.uses)) {
    add('github-release', pathFieldNames(step.with.files));
  }
  if (step.run) {
    if (/upload_to_play_store/.test(text)) {
      add('play-upload', commandNames(text));
    }
    if (/\bgh\s+release\s+(?:create|upload)/.test(step.run)) {
      add('gh-release-cli', commandNames(step.run));
    }
    if (gitPushArguments(step.run).length > 0) {
      add('tag-push', []);
    }
  }
  return rules.length > 0 ? {rules, paths: [...new Set(paths)]} : null;
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

/**
 * Never on its own either: it reads only the job, so a step inside a job that
 * builds nothing could grow any transport it liked and stay exempt. Paired
 * with the step half at every use.
 */
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
    // Not `carriesNoTransport`: the iOS lane legitimately runs
    // `upload_to_testflight`, so naming no Android artifact is the half that
    // can hold here — and it is what goes red if this step gains one.
    assert: (step, job, m) =>
      runsNoAndroidGradle(step, job, m) &&
      namesNoAndroidArtifact(step, job, m) &&
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

/**
 * Takes the source, not the path, so a mutated composite can be probed.
 *
 * Reads `with:` as well as `run:` and `uses:`, mirroring `stepText` — a
 * composite's inner steps are steps, and the one that ships bytes is far more
 * likely to be `uses: actions/upload-artifact@v4` with a `path:` than a raw
 * shell command. Reading two of the three fields is how a composite that
 * uploads the APK, or caches `build/outputs`, reads as shipping nothing.
 */
const shipsNothing = source => {
  const steps = yaml.load(source).runs.steps || [];
  const text = steps
    .map(step =>
      [step.run || '', step.uses || '', JSON.stringify(step.with || {})].join(
        '\n',
      ),
    )
    .join('\n');
  const publishes = steps.some(step =>
    /^(?:actions\/upload-artifact|softprops\/action-gh-release)@/.test(
      step.uses || '',
    ),
  );
  return (
    !publishes &&
    !SENDS_BYTES_OUT.test(text) &&
    !/build\/outputs/.test(text) &&
    artifactsIn(text).length === 0
  );
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

/**
 * The same step in a job that satisfies **every job-level predicate**: it
 * builds nothing, and it has a gate step below the probe. Any assertion still
 * returning true here is deciding on the job and ignoring the step it was
 * handed — which the building-job probe above cannot reveal, because there the
 * job half is false and the assertion never has to look at the step at all.
 */
const PROBE_JOB_WITHOUT_EXCUSES = {
  workflow: 'probe.yml',
  id: 'probe',
  steps: [
    PROBE_STEP,
    {
      workflow: 'probe.yml',
      job: 'probe',
      index: 2,
      name: 'Verify the Android payload',
      run: `node scripts/verify-android-payload.js --apk ${APK_PATH}`,
      uses: '',
      with: {},
      raw: {},
    },
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

/** `if: always()` and friends run a step whatever the gate decided. */
const RUNS_REGARDLESS =
  /always\s*\(\s*\)|failure\s*\(\s*\)|cancelled\s*\(\s*\)/;

/**
 * The gate can still fail the job, and a failed gate still stops the publish.
 *
 * Both halves, because they are the same evasion from opposite ends. A skipped,
 * suppressed or piped gate keeps ordering and path identity green while
 * asserting nothing — the default shell is `bash -e {0}`, which sets no
 * pipefail, so a trailing `| tee` exits with tee's status. And a publishing
 * step carrying `if: always()` runs on a build the gate has just refused,
 * while its position in the job is still perfectly correct. `if: always()`
 * appears three and seven lines above two of the uploads already, so it is the
 * idiomatic thing to write there.
 */
function violationsOfGateCanFail(m) {
  const problems = [];

  for (const job of allJobs(m)) {
    if (!job.steps.some(isGateStep)) {
      continue;
    }
    for (const step of job.steps) {
      const publisher = publisherOf(step, m.lanes);
      if (publisher && RUNS_REGARDLESS.test(String(step.raw.if ?? ''))) {
        problems.push(
          `${where(step)} publishes under if: ${step.raw.if}, so it runs even when the gate failed`,
        );
      }
    }
  }

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
    // `+o errexit` is the same instruction spelled long; the short form alone
    // was the whole check.
    if (/set\s+\+(?:e\b|o\s+errexit)/.test(step.run)) {
      complain('disables errexit');
    }
    if (step.run.includes('--manifest')) {
      complain('passes --manifest, which is a test flag');
    }
    const commands = step.run
      .replace(/\\\n\s*/g, ' ')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));
    const final = commands[commands.length - 1] ?? '';
    // Must *begin* the final command, not merely appear in it. `bash -e` reports
    // no failure for a command it only inspected: `if <gate>; then …; fi` and
    // `while <gate>; do …; done` both exit 0, as does a negated `! <gate>`.
    // Testing only for the script's presence rewards collapsing the multi-line
    // `if` — which the old parse did catch — onto one line.
    if (!/^node\s+\S*verify-android-payload\.js\b/.test(final)) {
      complain('does not invoke the payload check as its final command');
    }
    // Backgrounded, so the shell moves on and never sees the exit status.
    if (/&\s*$/.test(final)) {
      complain('backgrounds the payload check with &');
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

    expect(steps['Upload Android app to Alpha track'].rules).toEqual([
      'play-upload',
    ]);
    expect(steps['Push the release tag'].rules).toEqual(['tag-push']);
    expect(steps['Create GitHub Release'].rules).toEqual(['github-release']);

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
   * to write by accident restates its own lookup key or reads only the job.
   *
   * Two probe jobs, because one is not enough: an assertion deciding purely on
   * the job is falsified by the building-job probe without ever looking at the
   * step it was handed, and reads as sound. The second job satisfies every
   * job-level predicate — builds nothing, gate below the step — so only the
   * step half can carry it there. Add a probe whenever an exemption learns to
   * read something new.
   */
  it.each([
    ['a building job with no gate', () => PROBE_JOB],
    ['a job with every excuse removed', () => PROBE_JOB_WITHOUT_EXCUSES],
  ])('rests no exemption on an assertion that cannot fail, in %s', (_l, of) => {
    const job = of();
    for (const entry of NON_PUBLISHERS) {
      expect({
        entry: `${entry.workflow} ${entry.step}`,
        survivesTheProbe: entry.assert(PROBE_STEP, job, committed),
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
        survivesTheProbe: entry.assert(PROBE_STEP, job, committed),
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

  /**
   * A synthesised step has to arrive the way a parsed one does. `parseWorkflows`
   * runs every `run:` through `codeOf`, so a mutation that sets one directly is
   * exercising text the real parse would never have produced — and a case built
   * that way can pass while the reader it is meant to test does nothing.
   */
  const asParsed = fields => ({...fields, run: codeOf(fields.run ?? '')});
  const appendRun = (step, extra) => {
    step.run = codeOf(`${step.run}\n${extra}`);
  };

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
    job.steps.push(
      asParsed({
        workflow: 'ci.yml',
        job: 'build-android',
        index: job.steps.length,
        name: 'Upload the bundle to Play',
        run: 'bundle exec fastlane upload_android_alpha',
        uses: '',
        with: {},
        raw: {},
      }),
    );

    expect(violationsOfOrdering(m)).toEqual([]);
    expect(violationsOfPathIdentity(m)).toEqual([
      expect.stringContaining('app-prod-release.aab'),
    ]);
  });

  it('path identity fails when a step rewrites the artifact after the gate read it', () => {
    const m = broken();
    const job = jobIn(m, 'release.yml', 'build_android');
    const gate = job.steps.findIndex(isGateStep);
    job.steps.splice(
      gate + 1,
      0,
      asParsed({
        workflow: 'release.yml',
        job: 'build_android',
        index: 0,
        name: 'Re-sign the APK',
        run: 'apksigner sign android/app/build/outputs/apk/prod/release/app-prod-release.apk',
        uses: '',
        with: {},
        raw: {},
      }),
    );
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
    ['a trailing unrelated command', step => appendRun(step, 'echo done')],
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
  // Every spelling twice: alone, and paired with the very filename the gate
  // above it did examine. The pairing is the one that matters — a rule that
  // stops at the first name it recognises reports the pair as fully gated.
  const GATED_APK =
    'android/app/build/outputs/apk/prod/release/app-prod-release.apk';
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
    // Outside build/outputs entirely: a staging directory names no artifact a
    // filename rule can see, and keying on the Gradle path would miss it.
    ['a staging directory', 'dist/', 'cannot resolve to a filename'],
    ['an artifacts directory', 'artifacts/', 'cannot resolve to a filename'],
    [
      'a release directory',
      'android/app/release/',
      'cannot resolve to a filename',
    ],
  ].flatMap(([spelling, value, fragment]) => [
    [spelling, value, fragment],
    [`${spelling} beside a gated filename`, `${GATED_APK}\n${value}`, fragment],
  ]);

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
    job.steps.push(
      asParsed({
        ...step,
        workflow: 'ci.yml',
        job: 'build-android',
        index: job.steps.length,
        name: 'Ship the build output',
        run: '',
        raw: {},
      }),
    );

    expect(violationsOfOrdering(m)).toEqual([]);
    // Contains rather than equals: a path list naming the gated APK as well
    // legitimately reports the interposition too, and the case is about the
    // second path still being seen.
    expect(violationsOfPathIdentity(m)).toContainEqual(
      expect.stringContaining(fragment),
    );
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
    job.steps.splice(
      gate,
      0,
      asParsed({
        workflow: 'ci.yml',
        job: 'build-android',
        index: 0,
        name: 'Publish the build output',
        run,
        uses: '',
        with: {},
        raw: {},
      }),
    );
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
    job.steps.splice(
      gate,
      0,
      asParsed({
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
      }),
    );
    reindex(job);

    expect(violationsOfOrdering(m)).toEqual([
      expect.stringContaining('Upload the APK directory'),
    ]);
    expect(violationsOfPathIdentity(m)).toEqual([
      expect.stringContaining('cannot resolve to a filename'),
    ]);
  });

  // The classifier is an if-chain over a single step, so a step that is two
  // publishers at once used to be reported as whichever came first — and the
  // second one's path went with it.
  it('classifies a step that is two publishers at once, not just the first', () => {
    const m = broken();
    const step = stepIn(
      m,
      'release.yml',
      'build_android',
      'Upload Android app to Alpha track',
    );
    appendRun(
      step,
      'gh release upload "v$VERSION" android/app/build/outputs/apk/e2e/release/',
    );

    expect(publisherOf(step, m.lanes).rules).toEqual([
      'play-upload',
      'gh-release-cli',
    ]);
    expect(violationsOfPathIdentity(m)).toEqual([
      expect.stringContaining('cannot resolve to a filename'),
    ]);
  });

  /**
   * A publishing step carrying `if: always()` runs on a build the gate has
   * just refused, while sitting in exactly the right place in the job. Ordering
   * and path identity read position and paths; neither reads `if:`.
   */
  it.each([
    [
      'a workflow-artifact upload',
      {
        uses: 'actions/upload-artifact@v4',
        with: {name: 'apk', path: GATED_APK},
      },
    ],
    [
      'a GitHub Release',
      {uses: 'softprops/action-gh-release@v1', with: {files: GATED_APK}},
    ],
    ['a Play upload', {run: 'bundle exec fastlane upload_android_alpha'}],
    ['a gh release upload', {run: `gh release upload v1.0.0 ${GATED_APK}`}],
    ['a tag push', {run: 'git push origin "v1.0.0"'}],
  ])(
    'the gate-can-fail rule catches %s running under if: always()',
    (_l, s) => {
      const m = broken();
      const job = jobIn(m, 'ci.yml', 'build-android');
      job.steps.push(
        asParsed({
          workflow: 'ci.yml',
          job: 'build-android',
          index: job.steps.length,
          name: 'Publish regardless',
          run: '',
          uses: '',
          with: {},
          ...s,
          raw: {if: 'always()'},
        }),
      );

      expect(violationsOfGateCanFail(m)).toEqual([
        expect.stringContaining('runs even when the gate failed'),
      ]);
    },
  );

  it('leaves an if: that cannot outrun a failed gate alone', () => {
    const m = broken();
    const job = jobIn(m, 'ci.yml', 'build-android');
    job.steps.push(
      asParsed({
        workflow: 'ci.yml',
        job: 'build-android',
        index: job.steps.length,
        name: 'Publish on a branch',
        run: '',
        uses: 'actions/upload-artifact@v4',
        with: {name: 'apk', path: GATED_APK},
        raw: {if: "github.ref == 'refs/heads/main'"},
      }),
    );

    expect(violationsOfGateCanFail(m)).toEqual([]);
  });

  /**
   * `bash -e` reports no failure for a command it merely inspected, so each of
   * these exits 0 with the gate exiting non-zero. The multi-line `if` was
   * already caught, which is what made collapsing it onto one line the reward.
   */
  it.each([
    ['backgrounding', run => `${run.trim()} &`],
    ['negation', run => `! ${run.trim()}`],
    ['a single-line if', run => `if ${run.trim()}; then echo ok; fi`],
    ['a single-line while', run => `while ${run.trim()}; do break; done`],
    ['the long spelling of set +e', run => `set +o errexit\n${run.trim()}`],
  ])('the gate-can-fail rule catches %s', (_label, neuter) => {
    const m = broken();
    const gate = stepIn(
      m,
      'ci.yml',
      'build-android',
      'Verify the Android payload',
    );
    gate.run = codeOf(neuter(gate.run.replace(/\\\n\s*/g, ' ')));

    expect(violationsOfOrdering(m)).toEqual([]);
    expect(violationsOfGateCanFail(m).length).toBeGreaterThan(0);
  });

  /**
   * A `#` inside a quoted string is not a comment. Every consumer of this text
   * is an unanchored presence test, so a truncated line can only lose matches —
   * which always moves a step toward exempt.
   */
  it('does not lose the path that follows a quoted # on the same line', () => {
    const m = broken();
    const job = jobIn(m, 'ci.yml', 'build-android');
    const gate = job.steps.findIndex(isGateStep);
    // The note comes first, so a naive strip takes the artifact with it and
    // the step publishes, as far as the parse can tell, nothing at all.
    job.steps.splice(
      gate,
      0,
      asParsed({
        workflow: 'ci.yml',
        job: 'build-android',
        index: 0,
        name: 'Publish with a note',
        run: `gh release upload v1.0.0 --notes "Fixes #862" ${GATED_APK}`,
        uses: '',
        with: {},
        raw: {},
      }),
    );
    reindex(job);

    expect(violationsOfPathIdentity(m)).toContainEqual(
      expect.stringContaining('app-prod-release.apk'),
    );
  });

  it('keeps an exemption red when a quoted # precedes the transport', () => {
    const m = broken();
    const step = stepIn(
      m,
      'ci.yml',
      'build-android',
      'Create dummy release keystore for CI',
    );
    const entry = NON_PUBLISHERS.find(
      candidate => candidate.step === 'Create dummy release keystore for CI',
    );
    appendRun(
      step,
      `echo "phase #2" && curl -T ${GATED_APK} https://example.com/`,
    );

    expect(entry.assert(step, jobIn(m, 'ci.yml', 'build-android'), m)).toBe(
      false,
    );
  });

  /**
   * `runsNoAndroidGradle` reads the job and discards its step, so on its own it
   * exempts anything that job contains.
   */
  it('keeps the iOS upload exemption red when its step gains a transport', () => {
    const m = broken();
    const step = stepIn(
      m,
      'release.yml',
      'build_ios',
      'Build and upload iOS app',
    );
    const entry = NON_PUBLISHERS.find(
      candidate => candidate.step === 'Build and upload iOS app',
    );
    appendRun(step, `curl -T ${GATED_APK} https://example.com/`);

    expect(entry.assert(step, jobIn(m, 'release.yml', 'build_ios'), m)).toBe(
      false,
    );
  });

  /**
   * A composite's inner steps are steps: the one that ships bytes is far more
   * likely to be an `uses:` with a `path:` than a raw shell command, and half
   * of what the function reads had never been shown able to fail it.
   */
  it.each([
    [
      'an upload-artifact step naming the APK',
      `    - uses: actions/upload-artifact@v4\n      with:\n        path: ${GATED_APK}`,
    ],
    [
      'an upload-artifact step naming a directory',
      '    - uses: actions/upload-artifact@v4\n      with:\n        path: dist/',
    ],
    [
      'a cache of the build output',
      '    - uses: actions/cache@v4\n      with:\n        path: android/app/build/outputs',
    ],
  ])('refuses a composite carrying %s', (_label, body) => {
    const composite = [
      'name: probe',
      'runs:',
      '  using: composite',
      '  steps:',
      body,
    ].join('\n');
    expect(shipsNothing(composite)).toBe(false);
  });

  /**
   * `release.yml/build_android` runs no `gradlew`, so its building-ness rests
   * entirely on resolving the lane name — and the platform-prefixed form is
   * valid here because the Fastfile declares `default_platform :android`.
   */
  it('still sees the release job build through a platform-prefixed lane', () => {
    const m = broken();
    const step = stepIn(m, 'release.yml', 'build_android', 'Build Android app');
    step.run = step.run.replace(
      'fastlane build_android_release',
      'fastlane android build_android_release',
    );

    expect(
      isBuildingJob(jobIn(m, 'release.yml', 'build_android'), m.lanes),
    ).toBe(true);
    expect(violationsOfOrdering(m)).toEqual([]);
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
    job.steps.push(
      asParsed({
        workflow: 'ci.yml',
        job: 'build-and-test',
        index: job.steps.length,
        name: 'Build Android Release',
        run: './gradlew assembleProdRelease',
        uses: '',
        with: {},
        raw: {},
      }),
    );

    const building = allJobs(m)
      .filter(candidate => isBuildingJob(candidate, m.lanes))
      .map(candidate => `${candidate.workflow}/${candidate.id}`);
    expect(building).toHaveLength(4);
  });
});
