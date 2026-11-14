const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf-8');

const workflow = read('.github/workflows/release.yml');
const fastfile = read('android/fastlane/Fastfile');

const APK = 'android/app/build/outputs/apk/prod/release/app-prod-release.apk';
const AAB = 'android/app/build/outputs/bundle/prodRelease/app-prod-release.aab';

const job = name => {
  const match = workflow.match(
    new RegExp(
      `^  ${name}:\\n([\\s\\S]*?)(?=^  [\\w-]+:\\n|(?![\\s\\S]))`,
      'm',
    ),
  );
  return match ? match[1] : '';
};

const jobEnv = jobBody => {
  const match = jobBody.match(/^ {4}env:\n((?: {6}.*\n|\s*\n)*)/m);
  return match ? match[1] : '';
};

const steps = jobBody =>
  jobBody
    .split(/^(?= {6}- name: )/m)
    .filter(chunk => chunk.startsWith('      - name: '))
    .map(chunk => ({
      name: chunk.match(/^ {6}- name: (.+)$/m)[1].trim(),
      body: chunk,
    }));

const lane = name => {
  const match = fastfile.match(
    new RegExp(`^  (?:private_)?lane :${name} do\\b([\\s\\S]*?)^  end$`, 'm'),
  );
  return match ? match[1] : '';
};

const gradleTasks = laneBody =>
  [...laneBody.matchAll(/\bgradle\(\s*task:\s*"(\w+)"/g)].map(m => m[1]);

const buildAndroid = job('build_android');
const buildIos = job('build_ios');
const androidSteps = steps(buildAndroid);
const stepIndex = predicate => androidSteps.findIndex(predicate);
const gateChecks = artifact =>
  [
    ...buildAndroid.matchAll(
      new RegExp(
        `scripts/verify-plus-gate\\.sh\\s+${artifact.replace(/\./g, '\\.')}\\s+(--\\w+)`,
        'g',
      ),
    ),
  ].map(m => m[1]);

describe('the parse itself', () => {
  it('finds both release jobs and the Android steps', () => {
    expect(buildAndroid).toMatch(/runs-on: ubuntu/);
    expect(buildIos).toMatch(/runs-on: macos/);
    expect(
      stepIndex(step => step.name === 'Build Android app'),
    ).toBeGreaterThanOrEqual(0);
    expect(
      stepIndex(step => step.name === 'Create GitHub Release'),
    ).toBeGreaterThanOrEqual(0);
  });

  it('finds the upload lane in the Fastfile', () => {
    expect(lane('upload_android_alpha')).toMatch(/upload_to_play_store/);
  });
});

describe('the Plus mode of each Android release artifact', () => {
  it('is stated inline on its own fastlane call: the APK ungated, then the AAB gated', () => {
    const calls = [
      ...buildAndroid.matchAll(/bundle exec fastlane (build_android\w*)/g),
    ].map(m => m[1]);
    const modes = [
      ...buildAndroid.matchAll(
        /^\s*PLUS_STORE_GATE=(\w+) bundle exec fastlane (build_android\w*)\b/gm,
      ),
    ].map(m => [m[2], m[1]]);
    expect(calls).toEqual(['build_android_apk', 'build_android_aab']);
    expect(modes).toEqual([
      ['build_android_apk', 'false'],
      ['build_android_aab', 'true'],
    ]);
  });

  it('is not set for the whole Android job', () => {
    expect(jobEnv(buildAndroid)).toMatch(/rnllamaBuildFromSource/);
    expect(buildAndroid).not.toMatch(/PLUS_STORE_GATE\s*:/);
  });

  it('is never set by a lane', () => {
    expect(fastfile).not.toMatch(/PLUS_STORE_GATE/);
  });

  it('comes from one lane per artifact, each with a single prod release gradle call', () => {
    const apkLane = lane('build_android_apk');
    const aabLane = lane('build_android_aab');
    expect(gradleTasks(apkLane)).toEqual(['assemble']);
    expect(gradleTasks(aabLane)).toEqual(['bundle']);
    for (const body of [apkLane, aabLane]) {
      expect(body).toMatch(/flavor: "prod"/);
      expect(body).toMatch(/build_type: "Release"/);
      expect(body).toMatch(/print_command: false/);
    }
    expect(fastfile).not.toMatch(/build_android_release/);
  });

  it('keeps the iOS release gated', () => {
    expect(jobEnv(buildIos)).toMatch(/^\s*PLUS_STORE_GATE: 'true'$/m);
  });
});

describe('the Plus gate check before each publish step', () => {
  const checkStep = artifact =>
    stepIndex(step =>
      step.body.includes(`scripts/verify-plus-gate.sh ${artifact}`),
    );
  const buildStep = stepIndex(step => step.name === 'Build Android app');
  const publishSteps = [
    'Upload Android app to Alpha track',
    'Push the release tag',
    'Create GitHub Release',
  ].map(name => stepIndex(step => step.name === name));

  it('checks the APK ungated and never gated', () => {
    expect(gateChecks(APK)).toEqual(['--ungated']);
  });

  it('checks the AAB gated and never ungated', () => {
    expect(gateChecks(AAB)).toEqual(['--gated']);
  });

  it('runs both checks after the build and before every publish step', () => {
    for (const artifact of [APK, AAB]) {
      const at = checkStep(artifact);
      expect(at).toBeGreaterThan(buildStep);
      for (const publish of publishSteps) {
        expect(publish).toBeGreaterThan(at);
      }
    }
  });

  it('attaches the APK it checked ungated to the GitHub Release', () => {
    const release = androidSteps.find(
      step => step.name === 'Create GitHub Release',
    );
    expect(release.body).toMatch(new RegExp(`^\\s*files: ${APK}$`, 'm'));
  });

  it('keeps the upload lane refusing an AAB that is not gated', () => {
    const upload = lane('upload_android_alpha');
    const check = upload.search(
      /verify-plus-gate\.sh", Dir\.pwd\), aab, "--gated"\)/,
    );
    expect(check).toBeGreaterThanOrEqual(0);
    expect(check).toBeLessThan(upload.search(/upload_to_play_store/));
  });
});
